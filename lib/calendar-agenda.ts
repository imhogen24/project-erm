import { z } from "zod"

import type { JsonObject } from "@/db/schema"

// D1.6's rules that both the server and the screens read: the sheet's agenda
// and checks, what a saved record holds, what stops each step, and the
// calendar file sent with the invite.

// The sheet's agenda (docs/dev_docs/WORKBOOK_01, D1.6), which the OM starts
// from and may change.
export const defaultAgenda = [
  {
    minutes: 5,
    topic: "Introductions & Project Overview",
    leadSpeaker: "Project Manager",
    objective: "Establish rapport and align on the high-level project vision.",
  },
  {
    minutes: 15,
    topic: "Technical Requirements (Inputs/Outputs)",
    leadSpeaker: "Lead Engineer",
    objective: "Extract specific missing data identified in D1.3 (Section 4).",
  },
  {
    minutes: 10,
    topic: "Operational Environment & Constraints",
    leadSpeaker: "Lead Engineer",
    objective: "Define the physical environment and human operator limits.",
  },
  {
    minutes: 5,
    topic: "Commercial Expectations (Timeline/Budget)",
    leadSpeaker: "Project Manager",
    objective:
      "Ensure IMHOGEN and the client are aligned on business realities.",
  },
  {
    minutes: 5,
    topic: "Next Steps & Q&A",
    leadSpeaker: "Project Manager",
    objective: "Outline the Feasibility Report and Project Briefing stages.",
  },
]

// The sheet's pre-meeting checks, fixed, with who does each by default.
export const preMeetingChecks = [
  {
    task: "Has the Lead Engineer reviewed D1.3 (Received Request Record)?",
    assignee: "Lead Engineer",
  },
  {
    task: "Is the meeting recording software/consent prepared?",
    assignee: "Project Manager",
  },
  {
    task: "Have previous reference documents (D1.1) been opened for screen sharing?",
    assignee: "Project Manager",
  },
]

export const DONE = "Done"

export const checkStatuses = ["Not done", DONE] as const

const agendaItem = z.object({
  minutes: z.number().optional().catch(undefined),
  topic: z.string().catch(""),
  leadSpeaker: z.string().catch(""),
  objective: z.string().catch(""),
})

export type AgendaItem = z.infer<typeof agendaItem>

const check = z.object({
  task: z.string().catch(""),
  assignee: z.string().catch(""),
  status: z.string().catch(""),
})

const attendee = z.object({
  personId: z.string().catch(""),
  name: z.string().catch(""),
  role: z.string().catch(""),
})

export type Attendee = z.infer<typeof attendee>

const agenda = z.object({
  agenda: z.array(agendaItem).optional().catch(undefined),
  imhogenAttendees: z.array(attendee).catch([]),
  preMeetingChecks: z.array(check).catch([]),
  notes: z.string().optional().catch(undefined),
  clientAttendees: z.string().optional().catch(undefined),
  inviteSentAt: z.string().optional().catch(undefined),
  inviteSequence: z.number().int().optional().catch(undefined),
  inviteDigest: z.string().optional().catch(undefined),
})

export type CalendarAgenda = z.infer<typeof agenda>

// A saved D1.6, with anything odd read as empty. Before the OM changes the
// agenda, it is the sheet's.
export function agendaOf(payload: JsonObject): CalendarAgenda {
  return agenda.parse(payload)
}

export function agendaItems(saved: CalendarAgenda): AgendaItem[] {
  return saved.agenda ?? defaultAgenda
}

// Each check with its saved assignee and status, in the sheet's order.
export function checksOf(saved: CalendarAgenda) {
  return preMeetingChecks.map((each) => {
    const stored = saved.preMeetingChecks.find((row) => row.task === each.task)

    return {
      task: each.task,
      assignee: stored?.assignee || each.assignee,
      status: stored?.status ?? "",
    }
  })
}

// How long the meeting runs: the agenda's minutes, at least half an hour.
export function meetingMinutes(items: AgendaItem[]): number {
  const total = items.reduce((sum, item) => sum + (item.minutes ?? 0), 0)

  return Math.max(total, 30)
}

// The meeting details D1.6 takes from the confirmed D1.5.
export type MeetingDetails = {
  date: string
  time: string
  timeZone: string
  platform: string
  link: string
}

// What still stops the OM sending the calendar invite.
export function missingToInvite(
  saved: CalendarAgenda,
  meeting: { at?: Date; now: Date }
): string[] {
  const missing: string[] = []

  if (!meeting.at) {
    missing.push("D1.5 has no agreed meeting time")
  } else if (meeting.at.getTime() <= meeting.now.getTime()) {
    missing.push("the meeting time has passed; agree a new one on D1.5")
  }

  if (saved.imhogenAttendees.length === 0) {
    missing.push("choose who attends from IMHOGEN")
  }

  const items = agendaItems(saved)

  if (items.length === 0) {
    missing.push("add at least one agenda topic")
  }

  items.forEach((item, index) => {
    if (!item.topic.trim() || !item.minutes || item.minutes <= 0) {
      missing.push(`give agenda topic ${index + 1} a topic and its minutes`)
    }
  })

  return missing
}

// What still stops the OM marking D1.6 ready, which locks it.
export function missingToBeReady(saved: CalendarAgenda): string[] {
  const missing: string[] = []

  if (!saved.inviteSentAt) {
    missing.push("send the calendar invite")
  }

  checksOf(saved).forEach((each, index) => {
    if (each.status !== DONE) {
      missing.push(`check ${index + 1} is not done`)
    }
  })

  return missing
}

// Text inside a calendar file: backslash, semicolon, comma and line breaks are
// escaped (RFC 5545, 3.3.11).
function icsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n")
}

// "20261117T140000Z".
function icsTime(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
}

// Lines longer than 75 octets are folded onto the next line, which starts
// with a space (RFC 5545, 3.1). The count is in UTF-8 bytes, and a character
// is never split.
const encoder = new TextEncoder()

function fold(line: string): string {
  const parts: string[] = []
  let current = ""
  let bytes = 0

  for (const character of line) {
    const size = encoder.encode(character).length

    if (bytes + size > 75) {
      parts.push(current)
      current = ` ${character}`
      bytes = 1 + size
    } else {
      current += character
      bytes += size
    }
  }

  parts.push(current)

  return parts.join("\r\n")
}

// A parameter such as CN is quoted, since a name may hold a comma, a colon
// or a semicolon. A quote cannot appear inside one, so it is dropped (RFC
// 5545, 3.2).
function icsParameter(value: string): string {
  return `"${value.replaceAll('"', "")}"`
}

export type InviteEvent = {
  // The same for every version of one meeting, so a later invite updates it.
  uid: string
  // Goes up with each invite sent for the meeting.
  sequence: number
  start: Date
  minutes: number
  summary: string
  description: string
  location: string
  link?: string
  organizer: string
  attendees: { name: string; email: string }[]
  now: Date
}

// A calendar invite (.ics) that calendars add as a meeting request.
export function calendarFile(event: InviteEvent): string {
  const end = new Date(event.start.getTime() + event.minutes * 60_000)

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//IMHOGEN//ERM//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${icsTime(event.now)}`,
    `DTSTART:${icsTime(event.start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(event.summary)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    `LOCATION:${icsText(event.location)}`,
    ...(event.link ? [`URL:${event.link}`] : []),
    `ORGANIZER;CN=IMHOGEN:mailto:${event.organizer}`,
    ...event.attendees.map(
      (person) =>
        `ATTENDEE;CN=${icsParameter(person.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${person.email}`
    ),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  return `${lines.map(fold).join("\r\n")}\r\n`
}
