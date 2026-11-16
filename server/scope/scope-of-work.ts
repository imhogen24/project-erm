import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { toolRecords, type JsonObject, type RecordState } from "@/db/schema"
import { calendarFile } from "@/lib/calendar-agenda"
import {
  missingToConfirm,
  proposalOf,
  type MeetingProposal,
} from "@/lib/meeting-proposal"
import { formatMeeting, meetingInstant, zoneLabel } from "@/lib/meeting-time"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { clientAttendees, projectTeam } from "@/server/meetings/calendar-invite"
import {
  ALIGNMENT_MEETING,
  MeetingNotReadyError,
  schedulingContext,
} from "@/server/meetings/meeting-proposal"
import { assertCan, rolesOn } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"
import { assertProjectActive } from "@/server/projects/projects"
import { reviewValues } from "@/server/review/internal-review"
import { riskValues } from "@/server/risk/risk"

export const SCOPE_OF_WORK = ALIGNMENT_MEETING

type Reader = Pick<Transaction, "select">

export class InviteNotSentError extends Error {}

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const signed = z.object({ signedAt: z.string() })

const feasibility = z.object({
  realisticTimeline: z.string().optional().catch(undefined),
  assessorSignature: signed.optional().catch(undefined),
})

const drafted = z.object({ signature: signed.optional().catch(undefined) })

function dateOf(signature: z.infer<typeof signed> | undefined): string {
  return signature ? day.format(new Date(signature.signedAt)) : ""
}

// What 1.0 and 7.0 of D1.13 show: who drafts it, the client, project and
// request, the date D1.12 was assessed and its realistic timeline, the date
// of the draft's signature, and where the scope stands.
export async function scopeValues(
  database: Reader,
  projectId: string,
  record: { state: RecordState | "notStarted"; payload: JsonObject }
): Promise<JsonObject> {
  const [report] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, "D1.12"),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const assessed = feasibility.parse(report?.payload ?? {})
  const shared = await riskValues(database, projectId, {})
  const locked = record.state === "locked"
  const booked = Boolean(record.payload.inviteSentAt)

  let sowStatus = "Draft, pending client alignment"

  if (locked) {
    sowStatus = "Approved, scope locked"
  } else if (booked) {
    sowStatus = "Draft, alignment meeting booked"
  }

  return {
    draftedBy: shared.assessor ?? "",
    clientName: shared.clientName ?? "",
    projectTitle: (await clientProject(database, projectId)) ?? "",
    requestId: shared.requestId ?? "",
    assessmentDate: dateOf(assessed.assessorSignature),
    draftDate: dateOf(drafted.parse(record.payload).signature),
    sowStatus,
    duration: assessed.realisticTimeline ?? "",
    scopeLocked: locked
      ? "Yes"
      : "No, pending the client feasibility & engineering alignment meeting",
    readyForCosting: locked
      ? "Yes"
      : "No, pending the client's decision and scope confirmation",
  }
}

const titled = z.object({
  projectTitle: z.string().optional().catch(undefined),
})

async function clientProject(database: Reader, projectId: string) {
  return titled.parse(await reviewValues(database, projectId)).projectTitle
}

async function loadScope(database: Database, recordId: string) {
  const [record] = z.uuid().safeParse(recordId).success
    ? await database
        .select({
          id: toolRecords.id,
          projectId: toolRecords.projectId,
          toolId: toolRecords.toolId,
        })
        .from(toolRecords)
        .where(eq(toolRecords.id, recordId))
    : []

  if (!record || record.toolId !== SCOPE_OF_WORK) {
    throw new RecordNotFoundError(`No ${SCOPE_OF_WORK} record ${recordId}`)
  }

  return record
}

async function lockedDraft(
  transaction: Transaction,
  recordId: string
): Promise<{ current: ToolRecord; saved: MeetingProposal }> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      "The scope has been submitted, so the meeting cannot change"
    )
  }

  return { current, saved: proposalOf(current.payload) }
}

// The Lead Engineer's Send calendar invite, once the client has chosen a time
// and the platform and link are in. The calendar file goes to the client and
// to the project's LE and PM. Each press sends a new version that replaces the
// last one in their calendars; it counts as sent only once the email has gone.
export async function sendAlignmentInvite(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const record = await loadScope(database, recordId)

  await assertCan(database, actor, record.projectId, SCOPE_OF_WORK, "write")

  const now = options.now ?? new Date()
  const context = await schedulingContext(database, record.projectId)
  const client = await clientAttendees(database, record.projectId)

  const team = (await projectTeam(database, record.projectId)).filter(
    (member) => member.roles.some((role) => role === "LE" || role === "PM")
  )

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const { current, saved } = await lockedDraft(transaction, recordId)
    const missing = missingToConfirm(saved)

    const at =
      saved.agreedDate && saved.agreedTime && saved.agreedTimeZone
        ? meetingInstant(
            saved.agreedDate,
            saved.agreedTime,
            saved.agreedTimeZone
          )
        : undefined

    if (at && at.getTime() <= now.getTime()) {
      missing.push("the agreed time has passed; send new times")
    }

    if (client.length === 0) {
      missing.push("the client's email is missing from the web request")
    }

    if (missing.length > 0 || !at) {
      throw new MeetingNotReadyError(missing)
    }

    const sequence = (proposalOf(current.payload).inviteSequence ?? -1) + 1

    await setSystemValues(
      transaction,
      actor,
      recordId,
      { inviteSequence: sequence, inviteSentAt: null },
      "Calendar invite prepared",
      "draft"
    )

    return { saved, at, sequence }
  })

  const { saved, at, sequence } = prepared
  const zone = saved.agreedTimeZone!
  const when = `${formatMeeting(at, zone)} ${zoneLabel(zone)}`
  const where = saved.meetingLink?.trim() || saved.platform || ""
  const from = requireEnv("EMAIL_FROM")
  const [main, ...others] = client

  const ics = calendarFile({
    uid: `${recordId}@erm.imhogen`,
    sequence,
    start: at,
    minutes: 60,
    summary: `IMHOGEN feasibility & engineering alignment meeting: ${context.title}`,
    description: [
      saved.meetingLink?.trim() ?? "",
      "Engineering findings, the draft scope of work, the realistic timeline and the direction for the project.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    location: where,
    link: saved.meetingLink?.trim() || undefined,
    organizer: /<([^>]+)>/.exec(from)?.[1] ?? from.trim(),
    attendees: [
      ...client,
      ...team.map((member) => ({ name: member.name, email: member.email })),
    ],
    now,
  })

  const sent = await sendEmail(
    database,
    {
      to: main!.email,
      cc: [
        ...others.map((each) => each.email),
        ...team.map((member) => member.email),
      ],
      kind: "calendar_invite",
      data: {
        subject: `Feasibility & engineering alignment meeting: ${context.title} [${context.requestId}]`,
        body: [
          `Dear ${main!.name},`,
          `Our feasibility & engineering alignment meeting for ${context.title} is booked for ${when}.`,
          where,
          "We will present our engineering findings and the draft scope of work, and agree the direction for the project before costing.",
          "The calendar invite is attached.",
          "Best regards,",
        ]
          .filter((line) => line !== "")
          .join("\n\n"),
        ics,
      },
      projectId: record.projectId,
      recordId,
      key: `alignment_invite:${recordId}:${sequence}`,
    },
    options.transport ?? getTransport()
  )

  if (sent.status !== "sent") {
    throw new InviteNotSentError(
      sent.status === "queued"
        ? "This invite is already being sent. Reload the page in a moment."
        : `The invite did not go: ${sent.error ?? "no reason given"}. Press Send calendar invite to try again.`
    )
  }

  return database.transaction(async (transaction) => {
    const { current } = await lockedDraft(transaction, recordId)

    // A newer invite was prepared since; that one records itself.
    if (proposalOf(current.payload).inviteSequence !== sequence) {
      return current
    }

    return setSystemValues(
      transaction,
      actor,
      recordId,
      { inviteSentAt: now.toISOString() },
      "Calendar invite sent",
      "draft"
    )
  })
}

// The meeting as the client sees it on D1.13, before the scope is approved:
// the times sent and what they answered. Only the project's client gets it.
export async function clientMeeting(
  database: Database,
  actor: string,
  projectId: string
): Promise<{ recordId: string; saved: MeetingProposal; open: boolean } | null> {
  if (!(await rolesOn(database, actor, projectId)).includes("Client")) {
    return null
  }

  const [record] = await database
    .select({
      id: toolRecords.id,
      state: toolRecords.state,
      payload: toolRecords.payload,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, SCOPE_OF_WORK)
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  if (!record || record.state === "locked" || record.state === "void") {
    return null
  }

  return {
    recordId: record.id,
    saved: proposalOf(record.payload),
    open: record.state === "draft",
  }
}
