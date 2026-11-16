import { z } from "zod"

import type { JsonObject } from "@/db/schema"

// D1.14's sums, read by the form as the Lead Engineer types and by the server
// when the sheet is submitted, so both always agree.

export const COST_ESTIMATION = "D1.14"

// 3.0's layers. Project Management & QC is applied to the base labor; the
// others to the base labor and the direct costs together.
export const markupLayers = [
  "Project Management & QC",
  "Administrative Overhead",
  "Sustainability / Risk Margin",
]

const amount = z.coerce.number().finite().catch(0)

const labor = z.object({ days: amount, dailyRate: amount })

const direct = z.object({ quantity: amount, unitCost: amount })

const markup = z.object({ rate: amount })

const allocation = z.object({ cost: amount })

const rowsOf = <T extends z.ZodType>(row: T) => z.array(row).catch([])

const sheet = z.object({
  labor: rowsOf(labor),
  directCosts: rowsOf(direct),
  markups: rowsOf(markup),
  allocations: rowsOf(allocation),
  // Empty until D1.12's cost floor is known.
  costFloor: z
    .preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.coerce.number().finite().optional()
    )
    .catch(undefined),
})

// Money is kept to the pesewa, so sums never drift.
function cents(value: number) {
  return Math.round(value * 100) / 100
}

function sum(values: number[]) {
  return cents(values.reduce((total, value) => total + value, 0))
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function ghs(value: number) {
  return `GHS ${money.format(value)}`
}

export type CostSummary = {
  costFloor: number | undefined
  laborTotals: number[]
  laborSubtotal: number
  directTotals: number[]
  directSubtotal: number
  markupValues: number[]
  totalProjectValue: number
  allocated: number
  // The total value less what 4.0 allocates: zero once it balances.
  unallocated: number
  // Undefined until D1.12's cost floor is known.
  overheadMet: boolean | undefined
}

// The sheet's sums from what the LE typed, and D1.12's cost floor.
export function costSummary(values: JsonObject): CostSummary {
  const typed = sheet.parse(values)

  const laborTotals = typed.labor.map((row) => cents(row.days * row.dailyRate))
  const laborSubtotal = sum(laborTotals)

  const directTotals = typed.directCosts.map((row) =>
    cents(row.quantity * row.unitCost)
  )

  const directSubtotal = sum(directTotals)

  const markupValues = typed.markups.map((row, index) =>
    cents(
      ((index === 0 ? laborSubtotal : laborSubtotal + directSubtotal) *
        row.rate) /
        100
    )
  )

  const totalProjectValue = sum([
    laborSubtotal,
    directSubtotal,
    ...markupValues,
  ])

  const allocated = sum(typed.allocations.map((row) => row.cost))

  return {
    costFloor: typed.costFloor,
    laborTotals,
    laborSubtotal,
    directTotals,
    directSubtotal,
    markupValues,
    totalProjectValue,
    allocated,
    unallocated: cents(totalProjectValue - allocated),
    overheadMet:
      typed.costFloor === undefined
        ? undefined
        : totalProjectValue >= typed.costFloor,
  }
}

export function allocationCheck(summary: CostSummary) {
  if (summary.totalProjectValue === 0) {
    return ""
  }

  if (summary.unallocated === 0) {
    return "Balanced with the total project value"
  }

  return summary.unallocated > 0
    ? `${ghs(summary.unallocated)} left to allocate`
    : `${ghs(-summary.unallocated)} more than the total project value`
}

function yesNo(met: boolean | undefined) {
  if (met === undefined) {
    return ""
  }

  return met ? "Yes" : "No, below the D1.12 cost floor"
}

function withCell(rows: JsonObject[], key: string, cells: number[]) {
  return rows.map((row, index) => ({ ...row, [key]: cells[index] ?? 0 }))
}

const tables = z.object({
  labor: z.array(z.record(z.string(), z.json())).catch([]),
  directCosts: z.array(z.record(z.string(), z.json())).catch([]),
  markups: z.array(z.record(z.string(), z.json())).catch([]),
})

// The three tables with each row's worked-out total or value in it.
export function withTotals(values: JsonObject, summary: CostSummary) {
  // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
  const rows = tables.parse(values) as {
    labor: JsonObject[]
    directCosts: JsonObject[]
    markups: JsonObject[]
  }

  return {
    labor: withCell(rows.labor, "total", summary.laborTotals),
    directCosts: withCell(rows.directCosts, "total", summary.directTotals),
    markups: withCell(rows.markups, "value", summary.markupValues),
  }
}

// What the form shows in D1.14's system cells: each row's total, each layer's
// value, the total project value, the allocation check and whether the
// minimum overhead recovery is met.
export function costCells(values: JsonObject): JsonObject {
  const summary = costSummary(values)
  const rows = withTotals(values, summary)

  // A cell shows text, as a typed amount does.
  const shown = (table: JsonObject[], key: string) =>
    table.map((row) => ({ ...row, [key]: String(row[key]) }))

  return {
    labor: shown(rows.labor, "total"),
    directCosts: shown(rows.directCosts, "total"),
    markups: shown(rows.markups, "value"),
    totalProjectValue: ghs(summary.totalProjectValue),
    costFloor: summary.costFloor === undefined ? "" : ghs(summary.costFloor),
    allocationCheck: allocationCheck(summary),
    minimumOverheadMet: yesNo(summary.overheadMet),
  }
}
