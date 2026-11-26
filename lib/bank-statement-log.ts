import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { companyBank } from "@/lib/company"
import { ghs } from "@/lib/cost-estimation"

// D3.7, the daily bank statement log: once a milestone's invoice is sent
// (D3.6), the Finance Officer checks IMHOGEN's bank account each working day
// for the client's payment. Each check is one iteration of the cycle's D3.7:
// submitting with Continue waiting locks that day's check and opens the next
// one straight away, and Proceed to D3.8 ends the log for the milestone.
// The app reminds the FO each working day at 9:00 while a check is open.

export const BANK_STATEMENT_LOG = "D3.7"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

export const PROCEED = "Proceed to D3.8 Reconciled Payment Log"

export const CONTINUE_WAITING = "Continue waiting"

export const actions = [PROCEED, CONTINUE_WAITING]

// The hour of the working day, in Ghana time (UTC), the reminder goes from.
export const REMINDER_HOUR = 9

// The account the FO checks, such as "IMHOGEN Fidelity Bank".
export function accountChecked(bankName = companyBank.bankName) {
  return `IMHOGEN ${bankName}`
}

const amount = z.number().optional().catch(undefined)

function cents(value: number) {
  return Math.round(value * 100) / 100
}

// Amount Deposited less the invoice's TOTAL AMOUNT DUE, to the cent, such
// as -15 for a deposit 15.00 short. Undefined until funds came in and both
// amounts are known.
export function varianceOf(values: JsonObject): number | undefined {
  const deposited = amount.parse(values.amountDeposited)
  const expected = amount.parse(values.expectedAmount)

  if (
    values.fundsDeposited !== YES ||
    deposited === undefined ||
    expected === undefined
  ) {
    return undefined
  }

  return cents(deposited - expected)
}

// The variance as the sheet shows it while it is typed.
export function bankLogCells(values: JsonObject): JsonObject {
  const variance = varianceOf(values)

  return variance === undefined ? {} : { variance: ghs(variance) }
}

// Whether `day` (YYYY-MM-DD) is a working day, Monday to Friday.
export function isWorkingDay(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()

  return weekday !== 0 && weekday !== 6
}
