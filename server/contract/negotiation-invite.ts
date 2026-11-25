import { eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { BASELINE } from "@/lib/baseline"
import { formatMeeting, meetingInstant, zoneLabel } from "@/lib/meeting-time"
import {
  MEETING_MINUTES,
  MEETING_ZONE,
  NEGOTIATION_INVITE,
  NO,
  PROPOSED_WHEN,
  YES,
  inviteScriptFor,
} from "@/lib/negotiation-invite"
import { fillText, placeholdersIn } from "@/lib/placeholders"
import type { Transaction } from "@/server/audit/audit"
import { namesOf } from "@/server/contract/transmittal"
import type { Transport } from "@/server/email/email"
import { lockedPayload } from "@/server/handoff/handoff"
import { clientAttendees, projectTeam } from "@/server/meetings/calendar-invite"
import {
  InviteRefusedError,
  emailInvite,
  inviteDigest,
  inviteSequence,
} from "@/server/meetings/invite-email"
import { assertCan } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

export { InviteRefusedError }

type Reader = Pick<Transaction, "select">

// D2.8 cannot send yet. Each entry says what is missing, in the words the
// button shows.
export class InviteNotReadyError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Not yet: ${missing.join("; ")}`)
    this.missing = missing
  }
}

// The parts of a saved D2.8 that sending reads.
const saved = z.object({
  proposedDate: z.string().optional().catch(undefined),
  meetingTime: z.string().optional().catch(undefined),
  platform: z.string().optional().catch(undefined),
  meetingLink: z.string().optional().catch(undefined),
  imhogenReps: z.string().optional().catch(undefined),
  clientReps: z.string().optional().catch(undefined),
  script: z.string().optional().catch(undefined),
  inviteSentAt: z.string().optional().catch(undefined),
  inviteSequence: z.number().int().optional().catch(undefined),
  inviteDigest: z.string().optional().catch(undefined),
  inviteWhen: z.string().optional().catch(undefined),
})

type Saved = z.infer<typeof saved>

function savedOf(payload: JsonObject): Saved {
  return saved.parse(payload)
}

const baselineRows = z
  .object({
    baseline: z
      .array(
        z.object({
          variable: z.string().catch(""),
          absoluteLimit: z.string().optional().catch(undefined),
        })
      )
      .catch([]),
  })
  .catch({ baseline: [] })

// D2.6's hard limits, one line per row of its 2.0 table that has one, such
// as "Advance Payment %: Absolute minimum 35% to cover initial BOM".
export function hardLimitsOf(baseline: JsonObject): string {
  return baselineRows
    .parse(baseline)
    .baseline.flatMap((row) => {
      const limit = row.absoluteLimit?.trim()

      return limit ? [`${row.variable}: ${limit}`] : []
    })
    .join("\n")
}

// Where D2.8 starts before the CA saves anything: the sheet's script with
// the client and project named, and D2.6's hard limits. The CA can change
// both.
export async function negotiationInviteStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { clientName, projectName } = await namesOf(database, projectId)

  return {
    script: inviteScriptFor(clientName, projectName),
    hardLimits: hardLimitsOf(
      await lockedPayload(database, projectId, BASELINE)
    ),
  }
}

// What D2.8 shows that the system fills, read live: the project's request
// ID, and whether the invite has gone.
export async function negotiationInviteValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  return {
    requestId: project?.requestId ?? "",
    inviteSent: savedOf(payload).inviteSentAt ? YES : NO,
  }
}

// The meeting's moment, read as Ghana time, or undefined until 1.0 holds a
// date and time.
function meetingAt(values: Saved): Date | undefined {
  return values.proposedDate && values.meetingTime
    ? meetingInstant(values.proposedDate, values.meetingTime, MEETING_ZONE)
    : undefined
}

// "Tue 1 Dec 2026, 10:00 GMT".
function whenOf(at: Date): string {
  return `${formatMeeting(at, MEETING_ZONE)} ${zoneLabel(MEETING_ZONE)}`
}

// The script as the CA wrote it, with the date and time sent last put back
// as `[Proposed Date & Time]`, so a changed 1.0 fills in the new one.
function scriptTemplate(values: Saved): string {
  const script = values.script ?? ""

  return values.inviteWhen
    ? script.replaceAll(values.inviteWhen, `[${PROPOSED_WHEN}]`)
    : script
}

// What still stops the CA sending the invite, in the words the button shows.
export function missingToInvite(
  payload: JsonObject,
  now: Date,
  hasClient = true
): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!values.proposedDate) {
    missing.push("add the proposed date")
  }

  if (!values.meetingTime) {
    missing.push("add the meeting time")
  }

  if (!values.platform?.trim()) {
    missing.push("add the platform or location")
  }

  const at = meetingAt(values)

  if (at && at.getTime() <= now.getTime()) {
    missing.push("the proposed time has passed; choose a later one")
  }

  const template = scriptTemplate(values)

  if (!template.trim()) {
    missing.push("add the invite script")
  }

  for (const name of new Set(placeholdersIn(template))) {
    if (name !== PROPOSED_WHEN) {
      missing.push(`replace [${name}] in the script`)
    }
  }

  if (!hasClient) {
    missing.push("the client's email is missing from the web request")
  }

  return missing
}

async function loadInvite(database: Reader, recordId: string) {
  const [record] = z.uuid().safeParse(recordId).success
    ? await database
        .select({
          projectId: toolRecords.projectId,
          toolId: toolRecords.toolId,
        })
        .from(toolRecords)
        .where(eq(toolRecords.id, recordId))
    : []

  if (!record || record.toolId !== NEGOTIATION_INVITE) {
    throw new RecordNotFoundError(`No ${NEGOTIATION_INVITE} record ${recordId}`)
  }

  return record
}

async function heldDraft(transaction: Transaction, recordId: string) {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      "D2.8 has been submitted, so the invite cannot change"
    )
  }

  return { current, values: savedOf(current.payload) }
}

// The CA's Send calendar invite on D2.8: emails the client contact on the web
// request and any other client account on the project, copying the project's
// Contract Admins, with the script and a calendar file for 1.0's meeting.
// `[Proposed Date & Time]` in the script is filled from 1.0. The version is
// reserved first and counts as sent only once the email has gone, so a
// refused email marks nothing sent. Pressing again sends the same invite
// once; a changed 1.0 or script goes as an update to the same meeting.
export async function sendNegotiationInvite(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const { projectId } = await loadInvite(database, recordId)

  await assertCan(database, actor, projectId, NEGOTIATION_INVITE, "write")

  const now = options.now ?? new Date()
  const client = await clientAttendees(database, projectId)

  const admins = (await projectTeam(database, projectId))
    .filter((member) => member.roles.includes("CA"))
    .map(({ name, email }) => ({ name, email }))

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const { current, values } = await heldDraft(transaction, recordId)
    const missing = missingToInvite(current.payload, now, client.length > 0)
    const at = meetingAt(values)

    if (missing.length > 0 || !at) {
      throw new InviteNotReadyError(
        missing.length > 0 ? missing : ["check the proposed date and time"]
      )
    }

    const when = whenOf(at)

    const script = fillText(scriptTemplate(values), {
      [PROPOSED_WHEN]: when,
    })

    const meeting = {
      at: at.toISOString(),
      platform: values.platform!.trim(),
      link: values.meetingLink?.trim() ?? "",
      imhogenReps: values.imhogenReps?.trim() ?? "",
      clientReps: values.clientReps?.trim() ?? "",
    }

    const digest = inviteDigest(
      JSON.stringify({
        meeting,
        script,
        to: [...client, ...admins].map((each) => each.email),
      })
    )

    const sequence = inviteSequence(values, digest)

    if (sequence !== values.inviteSequence) {
      await setSystemValues(
        transaction,
        actor,
        recordId,
        { inviteSequence: sequence, inviteDigest: digest, inviteSentAt: null },
        "Calendar invite prepared",
        "draft"
      )
    }

    return { at, when, script, meeting, sequence }
  })

  const [project] = await database
    .select({ name: projects.name, requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const { meeting } = prepared
  const where = [meeting.platform, meeting.link].filter(Boolean).join(": ")

  await emailInvite(database, {
    projectId,
    recordId,
    keyPrefix: "negotiation_invite",
    sequence: prepared.sequence,
    start: prepared.at,
    minutes: MEETING_MINUTES,
    summary: `Contract Alignment Meeting: ${project!.name}`,
    description: [
      meeting.link,
      "1. Review of requested amendments to the Draft Contract.",
      "2. Discussion of operational/timeline impacts.",
      "3. Finalizing terms for the Pending Signature Draft.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    location: meeting.link || meeting.platform,
    link: meeting.link || undefined,
    attendees: [...client, ...admins],
    subject: `Contract Alignment Meeting: ${project!.name} [${project!.requestId}]`,
    body: [
      prepared.script,
      [
        `When: ${prepared.when}`,
        `Where: ${where}`,
        ...(meeting.imhogenReps
          ? [`From IMHOGEN: ${meeting.imhogenReps}`]
          : []),
        ...(meeting.clientReps
          ? [`From your side: ${meeting.clientReps}`]
          : []),
      ].join("\n"),
      "The invite is attached, so you can add the meeting to your calendar.",
    ].join("\n\n"),
    now,
    transport: options.transport,
  })

  return database.transaction(async (transaction) => {
    const { current, values } = await heldDraft(transaction, recordId)

    // Already recorded for this version, or the CA sent a newer one since.
    if (values.inviteSentAt || values.inviteSequence !== prepared.sequence) {
      return current
    }

    return setSystemValues(
      transaction,
      actor,
      recordId,
      {
        inviteSentAt: now.toISOString(),
        inviteWhen: prepared.when,
        script: prepared.script,
      },
      "Calendar invite sent",
      "draft",
      ["script"]
    )
  })
}
