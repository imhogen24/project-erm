// A date field that follows another as it is typed (`follows`), such as
// D2.14's start date following the day the payment cleared.
export type Follower = { key: string; field: string; plusDurationOf?: string }

export function followersOf(
  fields: readonly {
    key: string
    type: string
    follows?: { field: string; plusDurationOf?: string }
  }[]
): Follower[] {
  return fields.flatMap((field) =>
    field.type === "date" && field.follows
      ? [{ key: field.key, ...field.follows }]
      : []
  )
}

// The days a duration holds, such as 40 for "40 Working Days" or 56 for
// "8 weeks". Undefined for one with no number of days or weeks.
export function daysIn(duration: string): number | undefined {
  const match = /(\d+)\s*(working\s+)?(day|week)s?/i.exec(duration)

  if (!match) {
    return undefined
  }

  const count = Number(match[1])

  return match[3]!.toLowerCase() === "week" ? count * 7 : count
}

// The day `days` after a YYYY-MM-DD day.
export function addDays(day: string, days: number): string | undefined {
  const at = Date.parse(`${day}T00:00:00Z`)

  return Number.isNaN(at)
    ? undefined
    : new Date(at + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// What a following date would hold given the values now, each read as text
// by its key: the date it follows, plus the duration's days. Undefined while
// there is nothing to follow, or the duration names no days.
export function followedDate(
  follower: Follower,
  textOf: (key: string) => string
): string | undefined {
  const from = textOf(follower.field)

  if (from === "") {
    return undefined
  }

  if (!follower.plusDurationOf) {
    return from
  }

  const days = daysIn(textOf(follower.plusDurationOf))

  return days === undefined ? undefined : addDays(from, days)
}

// Whether a following date moves now, and what it last held because it
// followed. It follows while it is empty or still holds what it last
// followed to; once the person types another date it stays theirs. When
// there is nothing to follow, it keeps its value and goes on following once
// there is.
export type FollowStep = {
  current: string
  next: string | undefined
  applied: string | undefined
}

// What a following date does: the value it moves to, if it moves, and what
// it now holds because it followed.
export type Followed = { value?: string; applied: string | undefined }

export function nextFollowed(step: FollowStep): Followed {
  const following =
    step.current === "" ||
    step.current === step.applied ||
    (step.applied === undefined && step.current === step.next)

  if (!following) {
    return { applied: step.applied }
  }

  if (!step.next) {
    return { applied: step.current === "" ? step.applied : step.current }
  }

  return step.next === step.current
    ? { applied: step.next }
    : { value: step.next, applied: step.next }
}
