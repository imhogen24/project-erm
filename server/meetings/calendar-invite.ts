import { createHash } from "node:crypto"

import { and, asc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type Role,
} from "@/db/schema"
import {
  agendaItems,
  agendaOf,
  calendarFile,
  meetingMinutes,
  missingToBeReady,
  missingToInvite,
  type CalendarAgenda,
  type MeetingDetails,
} from "@/lib/calendar-agenda"
import { formatMeeting, meetingInstant, zoneLabel } from "@/lib/meeting-time"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { assertCan } from "@/server/permissions/permissions"
import { inheritedValues } from "@/server/records/inherited"
import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotFoundError,
  lockDraftIn,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

import { MEETING_PROPOSAL, proposalOf } from "./meeting-proposal"

export const CALENDAR_AGENDA = "D1.6"

// D1.6 cannot move on yet. Each entry says what is missing, in the words the
// button shows.
export class AgendaNotReadyError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Not yet: ${missing.join("; ")}`)
    this.missing = missing
  }
}

// The email service did not take the invite.
export class InviteRefusedError extends Error {}

type Reader = Pick<Database, "select">

// The confirmed meeting from the locked D1.5, or null before it is locked.
export async function meetingDetails(
  database: Reader,
  projectId: string
): Promise<MeetingDetails | null> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, MEETING_PROPOSAL),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  const saved = record ? proposalOf(record.payload) : undefined

  if (!saved?.agreedDate || !saved.agreedTime || !saved.agreedTimeZone) {
    return null
  }

  return {
    date: saved.agreedDate,
    time: saved.agreedTime,
    timeZone: saved.agreedTimeZone,
    platform: saved.platform ?? "",
    link: saved.meetingLink ?? "",
  }
}

export type TeamMember = {
  personId: string
  name: string
  email: string
  roles: Role[]
}

// IMHOGEN's people on the project, each once with every role they hold
// there: who the OM chooses attendees from. The client is not one of them.
export async function projectTeam(
  database: Reader,
  projectId: string
): Promise<TeamMember[]> {
  const rows = await database
    .select({
      personId: people.id,
      name: people.name,
      email: people.email,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        ne(personProjectRoles.role, "Client")
      )
    )
    .orderBy(asc(people.name))

  const team = new Map<string, TeamMember>()

  for (const row of rows) {
    const member = team.get(row.personId) ?? {
      personId: row.personId,
      name: row.name,
      email: row.email,
      roles: [],
    }

    member.roles.push(row.role)
    team.set(row.personId, member)
  }

  return [...team.values()]
}

const request = z.object({
  contact_person: z.string().optional(),
  email: z.string().optional(),
  project_title: z.string().optional(),
})

export type ClientAttendee = { name: string; email: string }

// Who attends from the client: the contact on the web request, then any other
// client account on the project.
export async function clientAttendees(
  database: Reader,
  projectId: string
): Promise<ClientAttendee[]> {
  const [submission] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const answers = request.safeParse(submission?.submission ?? {}).data ?? {}
  const email = z.email().safeParse(answers.email?.trim())

  const accounts = await database
    .select({ name: people.name, email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "Client")
      )
    )
    .orderBy(asc(people.name))

  const attendees: ClientAttendee[] = email.success
    ? [
        {
          name: answers.contact_person?.trim() || email.data,
          email: email.data,
        },
      ]
    : []

  for (const account of accounts) {
    if (
      !attendees.some(
        (each) => each.email.toLowerCase() === account.email.toLowerCase()
      )
    ) {
      attendees.push(account)
    }
  }

  return attendees
}

type Loaded = {
  projectId: string
  state: string
  projectStatus: string
}

async function loadAgenda(database: Reader, recordId: string): Promise<Loaded> {
  const [record] = z.uuid().safeParse(recordId).success
    ? await database
        .select({
          projectId: toolRecords.projectId,
          toolId: toolRecords.toolId,
          state: toolRecords.state,
          projectStatus: projects.status,
        })
        .from(toolRecords)
        .innerJoin(projects, eq(projects.id, toolRecords.projectId))
        .where(eq(toolRecords.id, recordId))
    : []

  if (!record || record.toolId !== CALENDAR_AGENDA) {
    throw new RecordNotFoundError(`No ${CALENDAR_AGENDA} record ${recordId}`)
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
      "D1.6 is already ready for the meeting, so it cannot change"
    )
  }
}

async function lockedDraft(
  transaction: Transaction,
  recordId: string
): Promise<{ current: ToolRecord; saved: CalendarAgenda }> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      "D1.6 is already ready for the meeting, so it cannot change"
    )
  }

  return { current, saved: agendaOf(current.payload) }
}

// "IMHOGEN <noreply@imhogen.com>" is sent as "noreply@imhogen.com".
function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim()
}

// The email that carries the invite: when and where, who attends and the
// agenda.
export function inviteText(input: {
  contact: string
  title: string
  when: string
  meeting: MeetingDetails
  imhogen: string[]
  client: string[]
  agenda: ReturnType<typeof agendaItems>
}): string {
  const where = [input.meeting.platform, input.meeting.link]
    .filter((part) => part.trim() !== "")
    .join(": ")

  return [
    `Dear ${input.contact},`,
    `Your discovery meeting with IMHOGEN about ${input.title} is on ${input.when}.`,
    `Where: ${where || "to be confirmed"}`,
    `From IMHOGEN: ${input.imhogen.join(", ")}`,
    ...(input.client.length > 0
      ? [`From your side: ${input.client.join(", ")}`]
      : []),
    [
      "Agenda:",
      ...input.agenda.map(
        (item) =>
          `- ${item.minutes ?? 0} min: ${item.topic}${item.leadSpeaker ? ` (${item.leadSpeaker})` : ""}`
      ),
    ].join("\n"),
    "The invite is attached, so you can add the meeting to your calendar.",
    "Best regards,",
  ].join("\n\n")
}

// The OM's Send calendar invite: emails the meeting, with a calendar file, to
// the client and to the IMHOGEN attendees chosen from the project team. Its
// version is reserved first, so an invite never goes for a D1.6 that cannot
// take it, and it is marked sent only once the email has gone. Sending the
// same invite again only retries the email; a changed agenda or list of
// attendees goes as an update to the same meeting.
export async function sendCalendarInvite(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const record = await loadAgenda(database, recordId)

  await assertCan(database, actor, record.projectId, CALENDAR_AGENDA, "write")
  assertOpen(record)

  const now = options.now ?? new Date()
  const meeting = await meetingDetails(database, record.projectId)
  const team = await projectTeam(database, record.projectId)
  const client = await clientAttendees(database, record.projectId)

  const at = meeting
    ? meetingInstant(meeting.date, meeting.time, meeting.timeZone)
    : undefined

  const prepared = await database.transaction(async (transaction) => {
    const { saved } = await lockedDraft(transaction, recordId)
    const missing = missingToInvite(saved, { at, now })

    const chosen = saved.imhogenAttendees.map((each) =>
      team.find((member) => member.personId === each.personId)
    )

    if (chosen.some((member) => member === undefined)) {
      missing.push("someone chosen to attend is no longer on the project")
    }

    if (client.length === 0) {
      missing.push("the client's email is missing from the web request")
    }

    if (missing.length > 0 || !meeting || !at) {
      throw new AgendaNotReadyError(missing)
    }

    // SAFETY: an attendee not on the team was refused just above.
    const imhogen = chosen as TeamMember[]
    const agenda = agendaItems(saved)

    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          meeting,
          agenda,
          imhogen: imhogen.map((member) => member.email),
          client: client.map((each) => each.email),
        })
      )
      .digest("hex")
      .slice(0, 16)

    const sequence =
      saved.inviteDigest === digest && saved.inviteSequence !== undefined
        ? saved.inviteSequence
        : (saved.inviteSequence ?? -1) + 1

    // A new version of the invite is reserved before it goes, so a retry
    // sends the same one. It counts as sent only once the email has gone.
    if (sequence !== saved.inviteSequence) {
      await setSystemValues(
        transaction,
        actor,
        recordId,
        { inviteSequence: sequence, inviteDigest: digest, inviteSentAt: null },
        "Calendar invite prepared",
        "draft"
      )
    }

    return { imhogen, agenda, sequence }
  })

  // SAFETY: the transaction refused a D1.6 with no meeting or no client.
  const [main, ...others] = client
  const from = requireEnv("EMAIL_FROM")

  const [project] = await database
    .select({ name: projects.name, requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, record.projectId))

  const answers =
    request.safeParse(
      (
        await database
          .select({ submission: intakeSubmissions.submission })
          .from(intakeSubmissions)
          .where(eq(intakeSubmissions.projectId, record.projectId))
          .limit(1)
      )[0]?.submission ?? {}
    ).data ?? {}

  const title = answers.project_title?.trim() || project!.name
  const when = `${formatMeeting(at!, meeting!.timeZone)} ${zoneLabel(meeting!.timeZone)}`

  const ics = calendarFile({
    uid: `${recordId}@erm.imhogen`,
    sequence: prepared.sequence,
    start: at!,
    minutes: meetingMinutes(prepared.agenda),
    summary: `IMHOGEN discovery meeting: ${title}`,
    description: [
      meeting!.link,
      ...prepared.agenda.map(
        (item) => `${item.minutes ?? 0} min: ${item.topic}`
      ),
    ]
      .filter((line) => line !== "")
      .join("\n"),
    location: meeting!.link || meeting!.platform,
    link: meeting!.link || undefined,
    organizer: addressOf(from),
    attendees: [
      ...client,
      ...prepared.imhogen.map((member) => ({
        name: member.name,
        email: member.email,
      })),
    ],
    now,
  })

  const sent = await sendEmail(
    database,
    {
      to: main!.email,
      cc: [
        ...others.map((each) => each.email),
        ...prepared.imhogen.map((member) => member.email),
      ],
      kind: "calendar_invite",
      data: {
        subject: `Discovery meeting: ${title} [${project!.requestId}]`,
        body: inviteText({
          contact: main!.name,
          title,
          when,
          meeting: meeting!,
          imhogen: prepared.imhogen.map((member) => member.name),
          client: client.map((each) => each.name),
          agenda: prepared.agenda,
        }),
        ics,
      },
      projectId: record.projectId,
      recordId,
      key: `calendar_invite:${recordId}:${prepared.sequence}`,
    },
    options.transport ?? getTransport()
  )

  if (sent.status === "failed") {
    throw new InviteRefusedError(
      `The invite did not go: ${sent.error ?? "no reason given"}. Press Send calendar invite to try again.`
    )
  }

  if (sent.status === "queued") {
    throw new InviteRefusedError(
      "This invite is already being sent. Reload the page in a moment."
    )
  }

  return database.transaction(async (transaction) => {
    const { current, saved } = await lockedDraft(transaction, recordId)

    // Already recorded for this version, or the OM sent a newer one since.
    if (saved.inviteSentAt || saved.inviteSequence !== prepared.sequence) {
      return current
    }

    return setSystemValues(
      transaction,
      actor,
      recordId,
      {
        inviteSentAt: now.toISOString(),
        clientAttendees: client.map((each) => each.name).join(", "),
      },
      "Calendar invite sent",
      "draft"
    )
  })
}

// The OM's Ready for the meeting, once the invite is sent and every check is
// done: the meeting details from D1.5 are kept as they are now, and D1.6
// locks, which opens D1.7. Nobody approves it.
export async function readyForMeeting(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  const record = await loadAgenda(database, recordId)

  await assertCan(database, actor, record.projectId, CALENDAR_AGENDA, "write")
  assertOpen(record)

  return database.transaction(async (transaction) => {
    const { current, saved } = await lockedDraft(transaction, recordId)
    const missing = missingToBeReady(saved)

    if (missing.length > 0) {
      throw new AgendaNotReadyError(missing)
    }

    return lockDraftIn(
      transaction,
      actor,
      recordId,
      await inheritedValues(transaction, current)
    )
  })
}
