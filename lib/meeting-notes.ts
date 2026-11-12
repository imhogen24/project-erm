import { z } from "zod"

import { agendaItems, agendaOf } from "@/lib/calendar-agenda"
import type { JsonObject } from "@/db/schema"
import type { FormValues } from "@/lib/tool-definition"

// The meeting D1.6 planned, as D1.6 kept it once locked.
const planned = z.object({
  meetingDate: z.string().optional().catch(undefined),
  meetingTime: z.string().optional().catch(undefined),
})

// Where D1.7 starts before the OM types anything: the discussion rows are
// D1.6's agenda, the attendees are who D1.6 invited, not yet ticked present,
// and the date and start time are the ones planned. The OM corrects each to
// what happened.
export function notesStart(calendar: JsonObject): FormValues {
  const saved = agendaOf(calendar)

  const client = (saved.clientAttendees ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  const { meetingDate, meetingTime } = planned.parse(calendar)

  return {
    ...(meetingDate && { actualDate: meetingDate }),
    ...(meetingTime && { actualStartTime: meetingTime }),
    imhogenPresent: saved.imhogenAttendees.map((person) => ({
      name: person.name,
      present: false,
    })),
    clientPresent: client.map((name) => ({ name, present: false })),
    discussion: agendaItems(saved).map((item) => ({
      minutes: item.minutes ?? null,
      topic: item.topic,
      rawNotes: "",
      remarks: "",
    })),
  }
}
