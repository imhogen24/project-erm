import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"

// D1.15, the Tier 1 project brief and draft budget, and T3.D1.15a, the Tier 3
// drafting quote: the client-facing documents the PM approves.

export const PROJECT_BRIEF = "D1.15"

export const T3_QUOTE = "T3.D1.15a"

export const briefNotice =
  "This is a Draft Budget for discussion purposes. A formal binding contract will be issued upon agreement of these terms."

// The T3 sheet's standard deliverables, with what each usually is and comes
// as. The LE gives each a quantity and a delivery timeline, and may add more.
export const t3Deliverables = [
  {
    item: "3D Modeling",
    description: "Digitization of physical part to 3D",
    format: "STEP",
  },
  {
    item: "Drafting Package",
    description: "Full 2D Production Drawing set",
    format: "PDF/DWG",
  },
  {
    item: "BOM Extraction",
    description: "Automated Bill of Materials",
    format: "Excel",
  },
]

export const t3PricingLines = [
  "Engineering Man-Hours (Drafting)",
  "Reverse Engineering / Scanning Fee",
  "Markup / Admin Fee",
]

export const t3Exclusions = [
  "No Structural Analysis or FEA included.",
  "No Material Selection Advice.",
  "No Fabrication Liability.",
]

const amount = z.coerce.number().finite().catch(0)

const priced = z.object({
  pricing: z.array(z.object({ rate: amount, qty: amount })).catch([]),
})

const rows = z.object({
  pricing: z.array(z.record(z.string(), z.json())).catch([]),
})

function cents(value: number) {
  return Math.round(value * 100) / 100
}

// Each T3 pricing line's subtotal, Rate times Qty, and the total.
export function quoteSummary(values: JsonObject) {
  const subtotals = priced
    .parse(values)
    .pricing.map((line) => cents(line.rate * line.qty))

  return {
    subtotals,
    total: cents(subtotals.reduce((sum, each) => sum + each, 0)),
  }
}

// The pricing table with each line's subtotal in it, as the sheet stores it.
export function pricedLines(values: JsonObject): JsonObject[] {
  const { subtotals } = quoteSummary(values)
  // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
  const lines = rows.parse(values).pricing as JsonObject[]

  return lines.map((line, index) => ({
    ...line,
    subtotal: subtotals[index] ?? 0,
  }))
}

// What T3.D1.15a's system cells show as the LE types.
export function quoteCells(values: JsonObject): JsonObject {
  return {
    pricing: pricedLines(values).map((line) => ({
      ...line,
      subtotal: String(line.subtotal),
    })),
    totalT3ProjectValue: ghs(quoteSummary(values).total),
  }
}
