import { eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { projects, toolRecords, type JsonObject } from "@/db/schema"
import {
  KICKOFF_INVITE,
  KICKOFF_MINUTES,
  KICKOFF_ZONE,
  NO,
  YES,
  kickoffAgenda,
  kickoffScriptFor,
} from "@/lib/kickoff-invite"
import { formatMeeting, meetingInstant, zoneLabel } from "@/lib/meeting-time"
import { placeholdersIn } from "@/lib/placeholders"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import type { Transport } from "@/server/email/email"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { projectTeam } from "@/server/meetings/calendar-invite"
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
import { rosterStaff } from "@/server/team/team-assignment"

export { InviteRefusedError }

type Reader = Pick<Transaction, "select" | "selectDistinct">

// D4.6 cannot send yet. Each entry says what is missing, in the words the
// button shows.
export class KickoffInviteNotReadyError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Not yet: ${missing.join("; ")}`)
    this.missing = missing
  }
}

// The parts of a saved D4.6 that sending reads.
const saved = z.object({
  meetingDate: z.string().optional().catch(undefined),
  meetingTime: z.string().optional().catch(undefined),
  location: z.string().optional().catch(undefined),
  script: z.string().optional().catch(undefined),
  inviteSentAt: z.string().optional().catch(undefined),
  inviteSequence: z.number().int().optional().catch(undefined),
  inviteDigest: z.string().optional().catch(undefined),
})

type Saved = z.infer<typeof saved>

function savedOf(payload: JsonObject): Saved {
  return saved.parse(payload)
}

async function projectOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ name: projects.name, requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  return project ?? { name: "", requestId: "" }
}

// Where D4.6 starts before the PM saves anything: the sheet's script with
// the project named. The PM can change it.
export async function kickoffInviteStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  return {
    script: kickoffScriptFor((await projectOf(database, projectId)).name),
  }
}

// Who the invite goes to: each engineer on D4.3's locked roster, then the
// project's PMs, each once.
async function inviteesOf(database: Reader, projectId: string) {
  const engineers = await rosterStaff(
    database,
    await lockedPayload(database, projectId, TEAM_ASSIGNMENT)
  )

  const managers = (await projectTeam(database, projectId)).filter((member) =>
    member.roles.includes("PM")
  )

  const seen = new Set<string>()

  return {
    engineers,
    attendees: [...engineers, ...managers].flatMap(({ name, email }) => {
      const key = email.toLowerCase()

      if (seen.has(key)) {
        return []
      }

      seen.add(key)

      return [{ name, email }]
    }),
  }
}

// What D4.6 shows that the system fills, read live: the request ID, the
// project's PM as Lead Facilitator, D4.3's rostered engineers by name, and
// whether the invite has gone.
export async function kickoffInviteValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [project, leadFacilitator, { engineers }] = await Promise.all([
    projectOf(database, projectId),
    holderOf(database, projectId, "PM"),
    inviteesOf(database, projectId),
  ])

  return {
    requestId: project.requestId,
    leadFacilitator,
    attendees: engineers.map((engineer) => engineer.name).join(", "),
    inviteSent: savedOf(payload).inviteSentAt ? YES : NO,
  }
}

// The meeting's moment, read as Ghana time, or undefined until 1.0 holds a
// date and time.
function meetingAt(values: Saved): Date | undefined {
  return values.meetingDate && values.meetingTime
    ? meetingInstant(values.meetingDate, values.meetingTime, KICKOFF_ZONE)
    : undefined
}

// What still stops the PM sending the invite, in the words the button shows.
export function missingToKickoff(
  payload: JsonObject,
  now: Date,
  hasEngineers = true
): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!values.meetingDate) {
    missing.push("add the meeting date")
  }

  if (!values.meetingTime) {
    missing.push("add the time")
  }

  if (!values.location?.trim()) {
    missing.push("add the location or link")
  }

  const at = meetingAt(values)

  if (at && at.getTime() <= now.getTime()) {
    missing.push("the meeting time has passed; choose a later one")
  }

  if (!values.script?.trim()) {
    missing.push("add the invite script")
  }

  for (const name of new Set(placeholdersIn(values.script ?? ""))) {
    missing.push(`replace [${name}] in the script`)
  }

  if (!hasEngineers) {
    missing.push("D4.3's roster names no engineer with an account")
  }

  return missing
}

// Whether D4.3's locked roster names anyone the invite can go to.
export async function hasRosteredEngineers(
  database: Reader,
  projectId: string
): Promise<boolean> {
  return (await inviteesOf(database, projectId)).engineers.length > 0
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

  if (!record || record.toolId !== KICKOFF_INVITE) {
    throw new RecordNotFoundError(`No ${KICKOFF_INVITE} record ${recordId}`)
  }

  return record
}

async function heldDraft(transaction: Transaction, recordId: string) {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      "D4.6 has been submitted, so the invite cannot change"
    )
  }

  return { current, values: savedOf(current.payload) }
}

// A location that is a web address is also the meeting's link.
function linkOf(location: string): string | undefined {
  return /^https?:\/\//i.test(location) ? location : undefined
}

// The PM's Send invite on D4.6: emails every engineer on D4.3's locked
// roster and the project's PMs the script, with the date, time and place,
// and a calendar file for the meeting. The version is reserved first and
// counts as sent only once the email has gone, so a refused email marks
// nothing sent. Pressing again sends the same invite once; a changed 1.0 or
// script goes as an update to the same meeting.
export async function sendKickoffInvite(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const { projectId } = await loadInvite(database, recordId)

  await assertCan(database, actor, projectId, KICKOFF_INVITE, "write")

  const now = options.now ?? new Date()
  const { engineers, attendees } = await inviteesOf(database, projectId)

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const { current, values } = await heldDraft(transaction, recordId)

    const missing = missingToKickoff(current.payload, now, engineers.length > 0)

    const at = meetingAt(values)

    if (missing.length > 0 || !at) {
      throw new KickoffInviteNotReadyError(
        missing.length > 0 ? missing : ["check the meeting date and time"]
      )
    }

    const meeting = {
      at: at.toISOString(),
      location: values.location!.trim(),
      script: values.script!.trim(),
    }

    const digest = inviteDigest(
      JSON.stringify({ meeting, to: attendees.map((each) => each.email) })
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

    return { at, meeting, sequence }
  })

  const project = await projectOf(database, projectId)
  const { meeting } = prepared
  const link = linkOf(meeting.location)

  await emailInvite(database, {
    projectId,
    recordId,
    keyPrefix: "kickoff_invite",
    sequence: prepared.sequence,
    start: prepared.at,
    minutes: KICKOFF_MINUTES,
    summary: `Internal Kick-off: ${project.name}`,
    description: kickoffAgenda.join("\n"),
    location: meeting.location,
    link,
    attendees,
    subject: `Internal Kick-off: ${project.name}`,
    body: [
      meeting.script,
      [
        `When: ${formatMeeting(prepared.at, KICKOFF_ZONE)} ${zoneLabel(KICKOFF_ZONE)}`,
        `Where: ${meeting.location}`,
      ].join("\n"),
      "The invite is attached, so you can add the meeting to your calendar.",
    ].join("\n\n"),
    now,
    transport: options.transport,
  })

  return database.transaction(async (transaction) => {
    const { current, values } = await heldDraft(transaction, recordId)

    // Already recorded for this version, or the PM sent a newer one since.
    if (values.inviteSentAt || values.inviteSequence !== prepared.sequence) {
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
