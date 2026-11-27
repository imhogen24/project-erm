import { z } from "zod"

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

// An amount that follows another as it changes (`follows` with
// `percentOf`), such as D3.4's VAT following the subtotal at D3.1's tax rate.
export type AmountFollower = { key: string; field: string; percentOf: string }

export function amountFollowersOf(
  fields: readonly {
    key: string
    type: string
    follows?: { field: string; percentOf?: string }
  }[]
): AmountFollower[] {
  return fields.flatMap((field) =>
    field.type === "currency" && field.follows?.percentOf
      ? [
          {
            key: field.key,
            field: field.follows.field,
            percentOf: field.follows.percentOf,
          },
        ]
      : []
  )
}

// What a following amount would hold given the values now, each read as a
// number by its key: the rate, in percent, of the amount it follows, to the
// pesewa, as the input holds it. Undefined while either is missing.
export function followedAmount(
  follower: AmountFollower,
  amountOf: (key: string) => number | undefined
): string | undefined {
  const of = amountOf(follower.field)
  const rate = amountOf(follower.percentOf)

  return of === undefined || rate === undefined
    ? undefined
    : String(Math.round(of * rate) / 100)
}

// A table's date column that follows a date column of the row above it, plus
// some days (`followsRowAbove`), such as D4.8's phase starting the day after
// the phase before ends; or a date column of its own row, plus the days of a
// duration field of the tool (`followsInRow`), such as T3.D4.8a's target
// delivery date following the start date plus T3.D1.15a's timeline.
export type RowFollower = {
  table: string
  key: string
  column: string
} & ({ plusDays: number } | { sameRow: true; plusDurationOf: string })

export function rowFollowersOf(
  fields: readonly {
    key: string
    type: string
    columns?: readonly {
      key: string
      type: string
      followsRowAbove?: { column: string; plusDays: number }
      followsInRow?: { column: string; plusDurationOf: string }
    }[]
  }[]
): RowFollower[] {
  return fields.flatMap((field) =>
    field.type === "table"
      ? (field.columns ?? []).flatMap((column): RowFollower[] => {
          if (column.type !== "date") {
            return []
          }

          if (column.followsRowAbove) {
            return [
              { table: field.key, key: column.key, ...column.followsRowAbove },
            ]
          }

          return column.followsInRow
            ? [
                {
                  table: field.key,
                  key: column.key,
                  sameRow: true,
                  ...column.followsInRow,
                },
              ]
            : []
        })
      : []
  )
}

// A following cell as followRows reads it: the column it follows, in the
// row above or with `sameRow` its own, plus `plusDays`. With no days, such
// as a duration that names none, it has nothing to follow.
export type CellFollower = {
  key: string
  column: string
  plusDays: number | undefined
  sameRow?: boolean
}

// A row follower as followRows reads it, the days of a duration read from
// `textOf`, such as the form's values by key.
export function cellFollowerOf(
  follower: RowFollower,
  textOf: (key: string) => string
): CellFollower {
  return "sameRow" in follower
    ? {
        key: follower.key,
        column: follower.column,
        plusDays: daysIn(textOf(follower.plusDurationOf)),
        sameRow: true,
      }
    : follower
}

// What each following cell of a row last followed to, by its column.
export type AppliedCells = Record<string, string | undefined>

// A table's rows after following, what each following cell now holds
// because it followed, by row, and whether any cell changed.
export type FollowedRows<Row> = {
  rows: Row[]
  applied: AppliedCells[]
  moved: boolean
}

// A cell as a date's text: anything else is empty.
const dateText = z.string().catch("")

// A table's rows with each following cell moved, from the top down, so a
// row that follows one that just moved follows on. `applied` is what each
// cell last followed to, by row. Each cell follows as nextFollowed says.
// The first row follows nothing of a row above.
export function followRows<Row extends Record<string, unknown>>(
  rows: readonly Row[],
  followers: readonly CellFollower[],
  applied: readonly AppliedCells[]
): FollowedRows<Row> {
  const next: Row[] = []
  const nextApplied: AppliedCells[] = []
  let moved = false

  rows.forEach((row, index) => {
    const changes = new Map<string, string>()
    const held = new Map<string, string | undefined>()
    const above = next[index - 1]

    for (const follower of followers) {
      const source = follower.sameRow
        ? { ...row, ...Object.fromEntries(changes) }
        : above

      if (!source) {
        held.set(follower.key, undefined)
        continue
      }

      const from = dateText.parse(source[follower.column])

      const step = nextFollowed({
        current: dateText.parse(row[follower.key]),
        next:
          from === "" || follower.plusDays === undefined
            ? undefined
            : addDays(from, follower.plusDays),
        applied: applied[index]?.[follower.key],
      })

      if (step.value !== undefined) {
        changes.set(follower.key, step.value)
        moved = true
      }

      held.set(follower.key, step.applied)
    }

    next.push({ ...row, ...Object.fromEntries(changes) })
    nextApplied.push(Object.fromEntries(held))
  })

  return { rows: next, applied: nextApplied, moved }
}

// What each row last followed to, kept with the same row as rows are
// removed or added: each row of `rows` takes the applied cells of the same
// row of `previous`, found by its cells from where the last match ended, or
// else of the row in its place, such as one just edited.
export function alignApplied<Row>(
  previous: readonly Row[],
  rows: readonly Row[],
  applied: readonly AppliedCells[]
): AppliedCells[] {
  const before = previous.map((row) => JSON.stringify(row))
  let from = 0

  return rows.map((row) => {
    const at = before.indexOf(JSON.stringify(row), from)
    const matched = at === -1 ? from : at

    from = matched + 1

    return applied[matched] ?? {}
  })
}
