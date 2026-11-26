// D3.2, the systems payment record: the project's payment ledger, one row
// per milestone of D3.1's schedule, showing what is expected, when it was
// invoiced, when the money cleared and whether it was on time. The app
// works out almost all of it each time it is shown. The Finance Officer
// sets the expected trigger dates and the overall financial status. It is a
// living record: no Submit, never locked.

export const PAYMENT_RECORD = "D3.2"

export const financialStatuses = ["Healthy", "At Risk", "Overdue"]

// The days to pay when D3.1's Invoice Payment Window names none.
export const DEFAULT_WINDOW = 21

// What an Actual date shows until it is known.
export const PENDING = "Pending"

// What one milestone row of the ledger knows: the day it was invoiced and
// the day its money cleared, each YYYY-MM-DD, when known.
export type MilestoneDates = {
  invoiced?: string
  cleared?: string
}

const dayLength = 24 * 60 * 60 * 1000

// Whole days from one YYYY-MM-DD to another.
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / dayLength)
}

function days(count: number) {
  return `${count} ${count === 1 ? "day" : "days"}`
}

// Variance / Status of each row, in schedule order, on `today`: cleared on
// time or late against the payment window after the invoice date, awaiting
// payment or overdue while invoiced and not cleared, and, for the first row
// not invoiced, what it waits on (the advance invoice for row 2.1, D3.3 for
// a later one). Rows after that are Pending.
export function paymentStatuses(
  rows: readonly MilestoneDates[],
  window: number,
  today: string
): string[] {
  const next = rows.findIndex((row) => !row.invoiced && !row.cleared)

  return rows.map((row, index) => {
    if (row.cleared) {
      const late = row.invoiced
        ? daysBetween(row.invoiced, row.cleared) - window
        : 0

      return late > 0 ? `Cleared Late (${days(late)})` : "Cleared On Time"
    }

    if (row.invoiced) {
      const over = daysBetween(row.invoiced, today) - window

      return over > 0 ? `Overdue (${days(over)})` : "Awaiting Payment"
    }

    if (index !== next) {
      return PENDING
    }

    return index === 0 ? "Awaiting Advance Invoice" : "Awaiting D3.3 Trigger"
  })
}

const shownDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// A YYYY-MM-DD as the ledger shows it, such as "2 Jan 2027", or Pending.
export function shownDate(day: string | undefined): string {
  if (!day) {
    return PENDING
  }

  const when = new Date(`${day}T00:00:00Z`)

  return Number.isNaN(when.getTime()) ? day : shownDay.format(when)
}
