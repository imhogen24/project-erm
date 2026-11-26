import { z } from "zod"

import type { JsonObject } from "@/db/schema"

// D3.8, the reconciled payment log: once a milestone's bank check (D3.7)
// proceeds, the Finance Officer matches what cleared in the bank to the
// invoice, answers whether the funds are fully accounted for, signs and
// submits. The PM, as Head of Finance, approves a Yes, which marks the
// milestone's invoice PAID. A No cannot be approved: the PM sends it back,
// which reopens the milestone's D3.7 as a new check. One D3.8 per payment
// milestone cycle.

export const RECONCILED_PAYMENT = "D3.8"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

// 3.0's tasks, as the sheet words them. The app does both as D3.8 is
// approved and sets them Done.
export const accountingTasks = [
  {
    task: 'Has the invoice status been changed to "PAID" in the central database?',
    assignee: "Finance Officer",
  },
  {
    task: "Has the revenue been officially logged against the specific project ledger?",
    assignee: "Finance Officer",
  },
]

const amount = z.number().optional().catch(undefined)

const day = z.string().optional().catch(undefined)

function cents(value: number) {
  return Math.round(value * 100) / 100
}

// What cleared in the bank across a milestone's bank checks (D3.7's
// entries): the sum of every Amount Deposited where funds came in, and the
// latest Value Date among them. Undefined until a deposit is logged.
export function clearedOf(
  entries: JsonObject[]
): { amount: number; date: string | undefined } | undefined {
  const deposits = entries.flatMap((entry) => {
    const deposited = amount.parse(entry.amountDeposited)

    return entry.fundsDeposited === YES && deposited !== undefined
      ? [{ amount: deposited, date: day.parse(entry.valueDate) }]
      : []
  })

  if (deposits.length === 0) {
    return undefined
  }

  const dates = deposits.flatMap((each) => (each.date ? [each.date] : []))

  return {
    amount: cents(deposits.reduce((sum, each) => sum + each.amount, 0)),
    date: [...dates].sort().at(-1),
  }
}

// 2.0's sums: the invoice's total, what cleared, the day it cleared and the
// difference, such as -15 for a payment 15.00 short. A value not known yet
// is left out.
export function matchingOf(
  expected: number | undefined,
  entries: JsonObject[]
): JsonObject {
  const cleared = clearedOf(entries)

  return {
    ...(expected !== undefined && { expectedAmount: expected }),
    ...(cleared && { actualCleared: cleared.amount }),
    ...(cleared?.date && { dateCleared: cleared.date }),
    ...(expected !== undefined &&
      cleared && { variance: cents(cleared.amount - expected) }),
  }
}
