import { isDeepStrictEqual } from "node:util"

import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
  type Role,
} from "@/db/schema"
import {
  isFuture,
  missingToConfirm,
  missingToSendTimes,
  proposalOf,
  schedulingEmail,
  type MeetingProposal,
  type SchedulingContext,
} from "@/lib/meeting-proposal"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { notify } from "@/server/notifications/notifications"
import {
  PermissionDeniedError,
  assertCan,
  rolesOn,
} from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotFoundError,
  ValidationError,
  lockDraftIn,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

export const MEETING_PROPOSAL = "D1.5"

// D1.5 cannot move on yet. Each entry says what is missing, in the words the
// button shows.
export class MeetingNotReadyError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Not yet: ${missing.join("; ")}`)
    this.missing = missing
  }
}

// The email service did not take the email. Nothing was marked sent.
export class MeetingEmailRefusedError extends Error {}

const submission = z.object({
  contact_person: z.string().optional(),
  email: z.string().optional(),
  project_title: z.string().optional(),
})

export async function schedulingContext(
  database: Pick<Database, "select">,
  projectId: string
): Promise<SchedulingContext> {
  const [row] = await database
    .select({
      name: projects.name,
      requestId: projects.requestId,
      submission: intakeSubmissions.submission,
    })
    .from(projects)
    .leftJoin(intakeSubmissions, eq(intakeSubmissions.projectId, projects.id))
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!row) {
    throw new RecordNotFoundError(`No project with id ${projectId}`)
  }

  const request = submission.safeParse(row.submission ?? {}).data ?? {}
  const email = z.email().safeParse(request.email?.trim())

  return {
    clientEmail: email.success ? email.data : null,
    contact: request.contact_person?.trim() || "[Client Name]",
    title: request.project_title?.trim() || row.name,
    requestId: row.requestId,
  }
}

type Loaded = {
  id: string
  projectId: string
  state: string
  payload: JsonObject
  projectStatus: string
}

async function loadProposal(
  database: Pick<Database, "select">,
  recordId: string
): Promise<Loaded> {
  const [record] = z.uuid().safeParse(recordId).success
    ? await database
        .select({
          id: toolRecords.id,
          projectId: toolRecords.projectId,
          toolId: toolRecords.toolId,
          state: toolRecords.state,
          payload: toolRecords.payload,
          projectStatus: projects.status,
        })
        .from(toolRecords)
        .innerJoin(projects, eq(projects.id, toolRecords.projectId))
        .where(eq(toolRecords.id, recordId))
    : []

  if (!record || record.toolId !== MEETING_PROPOSAL) {
    throw new RecordNotFoundError(`No ${MEETING_PROPOSAL} record ${recordId}`)
  }

  return record
}

function assertOpen(record: Loaded) {
  if (record.projectStatus !== "active") {
    throw new ProjectNotActiveError(
      `This project is ${record.projectStatus.replace("_", " ")}, so nothing can change`
    )
  }

  if (record.state !== "draft") {
    throw new InvalidTransitionError(
      "The meeting is already confirmed, so it cannot change"
    )
  }
}

async function holders(
  transaction: Pick<Database, "selectDistinct">,
  projectId: string,
  held: readonly Role[]
): Promise<string[]> {
  const rows = await transaction
    .selectDistinct({ personId: personProjectRoles.personId })
    .from(personProjectRoles)
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        inArray(personProjectRoles.role, held)
      )
    )

  return rows.map((row) => row.personId)
}

function proposalPath(projectId: string) {
  return `/projects/${projectId}/tools/${MEETING_PROPOSAL}`
}

// Clears what the client answered, for a fresh set of times.
const noAnswer = {
  chosenSlot: null,
  clientComment: null,
  proposedDate: null,
  proposedTime: null,
  proposedTimeZone: null,
  agreedDate: null,
  agreedTime: null,
  agreedTimeZone: null,
  clientConfirmed: null,
}

// D1.5 under the transaction's lock, still a draft. Every check that decides
// a write reads this, so nothing changes between the check and the write.
async function lockedDraft(
  transaction: Transaction,
  recordId: string
): Promise<{ current: ToolRecord; saved: MeetingProposal }> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      "The meeting is already confirmed, so it cannot change"
    )
  }

  return { current, saved: proposalOf(current.payload) }
}

// The OM's Send to client: keeps a copy of the times as sent, clears any
// earlier answer, tells the client on their dashboard, then emails the times
// to the address on the web request. The times are saved first, so the client
// is never emailed times the record cannot take. Sending the same times again
// keeps the client's answer and only sends the email if it did not go.
export async function sendMeetingTimes(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; baseURL?: string; now?: Date } = {}
): Promise<ToolRecord> {
  const record = await loadProposal(database, recordId)

  await assertCan(database, actor, record.projectId, MEETING_PROPOSAL, "write")
  assertOpen(record)

  const context = await schedulingContext(database, record.projectId)
  const clientEmail = context.clientEmail

  const { updated, body, offer } = await database.transaction(
    async (transaction) => {
      const { saved } = await lockedDraft(transaction, recordId)
      const missing = missingToSendTimes(saved, options.now)

      if (!clientEmail) {
        missing.unshift("the client's email is missing from the web request")
      }

      if (missing.length > 0) {
        throw new MeetingNotReadyError(missing)
      }

      const times = saved.slots.map((each) => ({
        date: each.date,
        time: each.time.slice(0, 5),
        timeZone: each.timeZone,
      }))

      const text = schedulingEmail(context, times)

      const again =
        saved.sentToClientAt !== undefined &&
        isDeepStrictEqual(saved.offeredSlots, times)

      if (again) {
        return {
          updated: await lockRecord(transaction, recordId),
          body: saved.emailText ?? text,
          offer: saved.sentToClientAt!,
        }
      }

      const sentAt = (options.now ?? new Date()).toISOString()

      const written = await setSystemValues(
        transaction,
        actor,
        recordId,
        {
          ...noAnswer,
          offeredSlots: times,
          emailText: text,
          sentToClientAt: sentAt,
        },
        "Times sent to the client",
        "draft"
      )

      await notify(transaction, {
        personIds: await holders(transaction, record.projectId, ["Client"]),
        kind: "client_slots_ready",
        title: "Choose a time for your discovery meeting",
        text: `${times.length === 1 ? "One time is" : `${times.length} times are`} waiting for you`,
        projectId: record.projectId,
        recordId,
        path: proposalPath(record.projectId),
      })

      return { updated: written, body: text, offer: sentAt }
    }
  )

  const link = `${options.baseURL ?? requireEnv("BETTER_AUTH_URL")}${proposalPath(record.projectId)}`

  // SAFETY: the transaction refused a project with no client email.
  const sent = await sendEmail(
    database,
    {
      to: clientEmail!,
      kind: "meeting_times",
      data: {
        subject: `Choose a time for your discovery meeting [${context.requestId}]`,
        body,
        link,
      },
      projectId: record.projectId,
      recordId,
      // One email per offer: a new offer gets a new key, and a retry of the
      // same offer finds the email it already sent.
      key: `meeting_times:${recordId}:${offer}`,
    },
    options.transport ?? getTransport()
  )

  if (sent.status === "failed") {
    throw new MeetingEmailRefusedError(
      `The times are on the client's dashboard, but the email did not go: ${sent.error ?? "no reason given"}. Press Send to client to send it again.`
    )
  }

  if (sent.status === "queued") {
    throw new MeetingEmailRefusedError(
      "These times are already being sent. Reload the page in a moment."
    )
  }

  return updated
}

// Only the client answers D1.5.
async function assertClient(database: Database, actor: string, record: Loaded) {
  if (!(await rolesOn(database, actor, record.projectId)).includes("Client")) {
    throw new PermissionDeniedError("Only the client chooses the meeting time")
  }

  assertOpen(record)
}

// The client answers only times that were sent.
function assertSent(saved: MeetingProposal) {
  if (!saved.sentToClientAt || saved.offeredSlots.length === 0) {
    throw new InvalidTransitionError("No times have been sent yet")
  }
}

const comment = z
  .string()
  .trim()
  .max(2000, { error: "Keep the comment under 2,000 characters" })
  .optional()

function checkedComment(value: string | undefined): string | null {
  const parsed = comment.safeParse(value)

  if (!parsed.success) {
    throw new ValidationError([
      { field: "clientComment", message: parsed.error.issues[0]!.message },
    ])
  }

  return parsed.data || null
}

async function tellTeam(
  transaction: Transaction,
  projectId: string,
  recordId: string,
  title: string
) {
  await notify(transaction, {
    personIds: await holders(transaction, projectId, ["OM", "PM"]),
    kind: "client_responded",
    title,
    text: "D1.5 Meeting Time Proposal",
    projectId,
    recordId,
    path: proposalPath(projectId),
  })
}

// The client's choice of one of the times sent. The latest choice counts
// until the OM confirms the meeting. A time that has passed cannot be chosen.
export async function chooseMeetingTime(
  database: Database,
  actor: string,
  recordId: string,
  input: { slot: number; comment?: string },
  now: Date = new Date()
): Promise<ToolRecord> {
  const record = await loadProposal(database, recordId)

  await assertClient(database, actor, record)

  const text = checkedComment(input.comment)

  return database.transaction(async (transaction) => {
    const { saved } = await lockedDraft(transaction, recordId)

    assertSent(saved)

    const chosen = Number.isInteger(input.slot)
      ? saved.offeredSlots[input.slot - 1]
      : undefined

    if (!chosen) {
      throw new ValidationError([
        { field: "chosenSlot", message: "Choose one of the times offered" },
      ])
    }

    if (!isFuture(chosen, now)) {
      throw new ValidationError([
        {
          field: "chosenSlot",
          message: "That time has passed. Choose another, or propose one.",
        },
      ])
    }

    const updated = await setSystemValues(
      transaction,
      actor,
      recordId,
      {
        ...noAnswer,
        chosenSlot: input.slot,
        clientComment: text,
        agreedDate: chosen.date,
        agreedTime: chosen.time,
        agreedTimeZone: chosen.timeZone,
        clientConfirmed: true,
      },
      "The client chose a meeting time",
      "draft"
    )

    await tellTeam(
      transaction,
      record.projectId,
      recordId,
      "The client chose a meeting time"
    )

    return updated
  })
}

// When none of the times suit: the client proposes their own. The OM then
// sends times again, with this one among them if it suits IMHOGEN.
export async function proposeMeetingTime(
  database: Database,
  actor: string,
  recordId: string,
  input: { date: string; time: string; timeZone: string; comment?: string },
  now: Date = new Date()
): Promise<ToolRecord> {
  const record = await loadProposal(database, recordId)

  await assertClient(database, actor, record)

  const proposed = {
    date: input.date,
    time: input.time.slice(0, 5),
    timeZone: input.timeZone,
  }

  if (!isFuture(proposed, now)) {
    throw new ValidationError([
      {
        field: "proposedDate",
        message: "Give a date and time that has not passed yet",
      },
    ])
  }

  const text = checkedComment(input.comment)

  return database.transaction(async (transaction) => {
    const { saved } = await lockedDraft(transaction, recordId)

    assertSent(saved)

    const updated = await setSystemValues(
      transaction,
      actor,
      recordId,
      {
        ...noAnswer,
        clientComment: text,
        proposedDate: proposed.date,
        proposedTime: proposed.time,
        proposedTimeZone: proposed.timeZone,
      },
      "The client proposed another time",
      "draft"
    )

    await tellTeam(
      transaction,
      record.projectId,
      recordId,
      "The client proposed another meeting time"
    )

    return updated
  })
}

// The OM's Confirm meeting, once the client has chosen and the platform and
// link are in: locks D1.5, which opens D1.6. Nobody approves it. The checks
// read the record under the lock, so a client's change a moment earlier is
// seen.
export async function confirmMeeting(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  const record = await loadProposal(database, recordId)

  await assertCan(database, actor, record.projectId, MEETING_PROPOSAL, "write")
  assertOpen(record)

  return database.transaction(async (transaction) => {
    const { saved } = await lockedDraft(transaction, recordId)
    const missing = missingToConfirm(saved)

    if (missing.length > 0) {
      throw new MeetingNotReadyError(missing)
    }

    return lockDraftIn(transaction, actor, recordId)
  })
}

export {
  clientProposal,
  missingToConfirm,
  missingToSendTimes,
  proposalOf,
  schedulingEmail,
  slotStatus,
  type MeetingProposal,
  type Slot,
  type SlotStatus,
} from "@/lib/meeting-proposal"
