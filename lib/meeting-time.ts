// Meeting times on D1.5: a date and a time as the OM typed them, in a named
// time zone. The same moment is shown to the client in their own zone too.

// The zones the OM chooses from: IMHOGEN's own, then where clients are most
// likely to be. The label is what the sheet and the email show.
export const meetingZones = [
  { id: "Africa/Accra", label: "GMT" },
  { id: "Africa/Lagos", label: "WAT (Lagos)" },
  { id: "Africa/Johannesburg", label: "SAST (Johannesburg)" },
  { id: "Africa/Nairobi", label: "EAT (Nairobi)" },
  { id: "Europe/London", label: "UK (London)" },
  { id: "Europe/Berlin", label: "CET (Berlin)" },
  { id: "America/New_York", label: "US Eastern (New York)" },
  { id: "Asia/Dubai", label: "GST (Dubai)" },
] as const

export const DEFAULT_ZONE = "Africa/Accra"

export function zoneLabel(zone: string): string {
  return meetingZones.find((each) => each.id === zone)?.label ?? zone
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone })

    return true
  } catch {
    return false
  }
}

// What the wall clock in `zone` reads at `at`, as UTC parts.
function wallClock(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)

  const part = (type: string) =>
    Number(parts.find((each) => each.type === type)?.value)

  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  )
}

// The moment a date ("2026-08-11") and time ("14:00") in `zone` name, or
// undefined when either cannot be read.
export function meetingInstant(
  date: string,
  time: string,
  zone: string
): Date | undefined {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const clock = /^(\d{2}):(\d{2})/.exec(time)

  if (!day || !clock || !isZone(zone)) {
    return undefined
  }

  const asUtc = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2])
  )

  // Date.UTC rolls month 13 on to January, 31 Feb on to March and 25:00 on to
  // the next day.
  const named = new Date(asUtc)

  if (
    named.getUTCFullYear() !== Number(day[1]) ||
    named.getUTCMonth() !== Number(day[2]) - 1 ||
    named.getUTCDate() !== Number(day[3]) ||
    named.getUTCHours() !== Number(clock[1]) ||
    named.getUTCMinutes() !== Number(clock[2])
  ) {
    return undefined
  }

  // The zone's offset at that moment, found by reading the clock there. A
  // second pass settles the hour a clock change moves.
  let at = asUtc - (wallClock(new Date(asUtc), zone) - asUtc)

  at = asUtc - (wallClock(new Date(at), zone) - at)

  // The clock there must read what was asked. It does not in an hour a clock
  // change skips, which the offset would quietly move.
  return wallClock(new Date(at), zone) === asUtc ? new Date(at) : undefined
}

// "Tue 11 Aug 2026, 14:00" in `zone`.
export function formatMeeting(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(at)
    .replace(" at ", ", ")
}

// "11/08/2026", as the sheet writes a date.
export function sheetDate(date: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)

  return day ? `${day[3]}/${day[2]}/${day[1]}` : date
}

// "11/08/2026 at 14:00 GMT", as the sheet's email lists an option.
export function sheetSlot(slot: {
  date: string
  time: string
  timeZone: string
}): string {
  return `${sheetDate(slot.date)} at ${slot.time.slice(0, 5)} ${zoneLabel(slot.timeZone)}`
}
