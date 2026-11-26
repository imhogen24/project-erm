import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { amountOf, computedProduct } from "@/lib/computed-columns"
import { ghs } from "@/lib/cost-estimation"
import { daysIn } from "@/lib/follow-dates"

// D3.4, the draft invoice: once Finance accepts a milestone's billing trigger
// (D3.3), the Finance Officer drafts its invoice. The app numbers it and
// fills in the milestone line, the billing address, the bank details and
// D3.1's terms; the FO adds lines, checks the tax, signs and submits, which
// locks it. One D3.4 per payment milestone cycle.

export const DRAFT_INVOICE = "D3.4"

export const yesNo = ["Yes", "No"]

// The running number every invoice takes, such as IMHO-INV26-002.
export const INVOICE_SEQUENCE = "invoice"

// The first percentage a term names, such as 15 in "All prices are exclusive
// of 15% VAT". Undefined for a term with none.
export function percentIn(term: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(term)

  return match ? Number(match[1]) : undefined
}

// D3.1's payment window as the invoice says it, such as "21 Days from
// Issuance" for "Net 21 Days from Invoice Issuance". Empty for a term that
// names no days.
export function paymentDueText(term: string): string {
  const days = daysIn(term)

  return days === undefined
    ? ""
    : `${days} ${days === 1 ? "Day" : "Days"} from Issuance`
}

function cents(value: number) {
  return Math.round(value * 100) / 100
}

// A table's rows: anything that is not a row is an empty one.
const lineRows = z.array(z.record(z.string(), z.json()).catch({})).catch([])

// What the invoice adds up to.
export type InvoiceSums = { subtotal: number; vat: number; total: number }

// A line's Total Amount: its quantity times its unit price, to the pesewa.
// Undefined while either is missing.
export function lineTotal(row: JsonObject): number | undefined {
  return computedProduct(row.quantity, row.unitPrice)
}

// What the invoice adds up to: the lines' totals, the VAT the FO holds (none
// while it is empty), and the two together.
export function invoiceSums(values: JsonObject): InvoiceSums {
  // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
  const rows = lineRows.parse(values.lineItems) as JsonObject[]

  const subtotal = cents(
    rows.reduce((sum, row) => sum + (lineTotal(row) ?? 0), 0)
  )

  const vat = amountOf(values.vat) ?? 0

  return { subtotal, vat, total: cents(subtotal + vat) }
}

// The VAT that follows a subtotal at the rate D3.1's tax term names.
export function vatOf(subtotal: number, rate: number | undefined): number {
  return rate === undefined ? 0 : Math.round(subtotal * rate) / 100
}

// SUBTOTAL and TOTAL AMOUNT DUE as the sheet shows them while it is typed.
export function invoiceCells(values: JsonObject): JsonObject {
  const { subtotal, total } = invoiceSums(values)

  return { subtotal: ghs(subtotal), totalAmountDue: ghs(total) }
}
