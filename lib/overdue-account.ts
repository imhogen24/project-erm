// D3.11, the overdue accounts report: opened by the app the day after a
// milestone's invoice falls due unpaid. The Finance Officer logs each
// follow-up, answers the revised invoice, escalation and halt questions and
// submits; the PM, as Head of Finance, signs, which approves and locks it.
// Locked with the halt answered Yes, it halts the project's engineering
// work until the milestone's D3.8 is approved.

export const OVERDUE_ACCOUNTS = "D3.11"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// Who is told when a D3.11 halts engineering work, and when the halt lifts:
// the PM, the HE and the project's engineers.
export const HALT_TOLD = ["PM", "HE", "LE", "AE", "LD"] as const

// 2.0's fixed steps, in the order Finance takes them. The FO may add rows
// below them.
export const escalationSteps = [
  { action: "7-Day Courtesy Email Reminder (Before Due Date)" },
  { action: "Day 1 Overdue Notice (Formal Warning)" },
  { action: "Day 7 Overdue Phone Call" },
  { action: "Day 14 Overdue Work Stoppage Notice" },
]

export const escalationHints = [
  "e.g. Acknowledged by client",
  "e.g. No response",
  "e.g. Client stated waiting on internal signatures",
  "e.g. Project officially paused",
]

const DAY = 24 * 60 * 60 * 1000

// The whole days from one YYYY-MM-DD day to a later one, never below 0.
// Undefined when either is not a day.
export function daysLate(dueDate: string, until: string): number | undefined {
  const from = Date.parse(`${dueDate}T00:00:00Z`)
  const to = Date.parse(`${until}T00:00:00Z`)

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return undefined
  }

  return Math.max(0, Math.round((to - from) / DAY))
}

// Days Overdue as the sheet shows it, such as "14 Days" or "1 Day".
export function shownDays(days: number): string {
  return `${days} Day${days === 1 ? "" : "s"}`
}

// The percentage a penalty term holds, such as 2 for "2% Monthly Interest on
// outstanding balance". Undefined for a term with none.
export function percentIn(term: string): number | undefined {
  const match = /(\d*\.\d+|\d+)\s*%/.exec(term)

  return match ? Number(match[1]) : undefined
}

// The penalty accrued: the rate, in percent, of the outstanding balance for
// each month late, a started month counting as a whole one (30 days a
// month). 0 with no rate or no days late.
export function penaltyOf(
  ratePercent: number | undefined,
  balance: number,
  days: number
): number {
  if (ratePercent === undefined || days <= 0 || balance <= 0) {
    return 0
  }

  const months = Math.ceil(days / 30)

  return Math.round(balance * ratePercent * months) / 100
}
