import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { meetingInstant, meetingZones, sheetSlot } from "@/lib/meeting-time"

// D1.5's rules that both the server and the screens read: what a saved record
// holds, each slot's status, what stops the next step, and the email's text.

// The options of D1.5's platform, read by the server, so they must not change.
export const meetingPlatforms = [
  "Google Meet",
  "Microsoft Teams",
  "Zoom",
  "In person",
] as const

export const IN_PERSON = "In person"

const zoneIds: readonly string[] = meetingZones.map((zone) => zone.id)

const slot = z.object({
  date: z.string().catch(""),
  time: z.string().catch(""),
  timeZone: z.string().catch(""),
})

export type Slot = z.infer<typeof slot>

const proposal = z.object({
  slots: z.array(slot).catch([]),
  offeredSlots: z.array(slot).catch([]),
  sentToClientAt: z.string().optional().catch(undefined),
  chosenSlot: z.number().int().optional().catch(undefined),
  clientComment: z.string().optional().catch(undefined),
  proposedDate: z.string().optional().catch(undefined),
  proposedTime: z.string().optional().catch(undefined),
  proposedTimeZone: z.string().optional().catch(undefined),
  emailText: z.string().optional().catch(undefined),
  agreedDate: z.string().optional().catch(undefined),
  agreedTime: z.string().optional().catch(undefined),
  agreedTimeZone: z.string().optional().catch(undefined),
  platform: z.string().optional().catch(undefined),
  meetingLink: z.string().optional().catch(undefined),
  calendarInviteSent: z.boolean().optional().catch(undefined),
  clientConfirmed: z.boolean().optional().catch(undefined),
  note: z.string().optional().catch(undefined),
})

export type MeetingProposal = z.infer<typeof proposal>

// A saved D1.5, with anything odd read as empty.
export function proposalOf(payload: JsonObject): MeetingProposal {
  return proposal.parse(payload)
}

export type SlotStatus = "Pending" | "Accepted" | "Declined"

// The sheet's Status column for a slot the client was sent: Accepted for the
// one they chose, Declined for the rest once they chose or proposed another
// time, Pending until then.
export function slotStatus(
  saved: MeetingProposal,
  slotNumber: number
): SlotStatus {
  if (saved.chosenSlot === slotNumber) {
    return "Accepted"
  }

  return saved.chosenSlot !== undefined || saved.proposedDate !== undefined
    ? "Declined"
    : "Pending"
}

// The client proposed a time of their own and nothing was sent since.
export function clientProposal(saved: MeetingProposal) {
  if (!saved.proposedDate || !saved.proposedTime || !saved.proposedTimeZone) {
    return undefined
  }

  return {
    date: saved.proposedDate,
    time: saved.proposedTime,
    timeZone: saved.proposedTimeZone,
  }
}

export function isFuture(each: Slot, now: Date) {
  const at = meetingInstant(each.date, each.time, each.timeZone)

  return at !== undefined && at.getTime() > now.getTime()
}

// What still stops the OM sending the times, in the words the button shows.
export function missingToSendTimes(
  saved: MeetingProposal,
  now: Date = new Date()
): string[] {
  const rows = saved.slots

  if (rows.length === 0) {
    return ["add at least one time"]
  }

  const missing: string[] = []

  rows.forEach((each, index) => {
    if (!each.date || !each.time || !zoneIds.includes(each.timeZone)) {
      missing.push(`give slot ${index + 1} a date, a time and a time zone`)
    } else if (!isFuture(each, now)) {
      missing.push(`slot ${index + 1} has already passed`)
    }
  })

  return missing
}

const httpsLink = z.url({ protocol: /^https$/ })

// What still stops the OM confirming the meeting, which locks D1.5.
export function missingToConfirm(saved: MeetingProposal): string[] {
  const missing: string[] = []

  if (!saved.clientConfirmed || saved.chosenSlot === undefined) {
    missing.push("the client has not chosen a time")
  }

  if (!meetingPlatforms.some((platform) => platform === saved.platform)) {
    missing.push("choose the meeting platform or location")
  } else if (
    saved.platform !== IN_PERSON &&
    !httpsLink.safeParse(saved.meetingLink?.trim()).success
  ) {
    missing.push("add the meeting link (https://...)")
  }

  return missing
}

export type SchedulingContext = {
  // The address from the saved web request, or null when it has none.
  clientEmail: string | null
  contact: string
  title: string
  requestId: string
}

// The sheet's standard scheduling email (docs/dev_docs/WORKBOOK_01, D1.5), with
// the times listed. The client answers on their dashboard, so it asks them to
// choose there, not to reply.
export function schedulingEmail(
  context: Omit<SchedulingContext, "clientEmail">,
  slots: Slot[]
): string {
  return [
    `Dear ${context.contact},`,
    `Following our initial review of your request for ${context.title} [${context.requestId}], we would like to meet with you.`,
    "This 30-45 minute session will allow our engineering team to understand your operational constraints and exact technical needs.",
    [
      "Please choose which of the following times works best for you on your IMHOGEN dashboard:",
      ...slots.map(
        (each, index) => `- Option ${index + 1}: ${sheetSlot(each)}`
      ),
    ].join("\n"),
    "If none of these suit your schedule, please propose one there.",
    "We look forward to speaking with you.",
    "Best regards,",
  ].join("\n\n")
}
