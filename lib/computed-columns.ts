import { z } from "zod"

import type { JsonObject, JsonValue } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import type { Column, Field } from "@/lib/tool-definition"

// An amount as a number, whether stored as one or shown as text, such as
// "GHS 94,400.00". Undefined for anything else.
const amount = z
  .union([
    z.number().refine(Number.isFinite),
    z
      .string()
      .transform((text) => text.replace(/[^0-9.-]/g, ""))
      .refine((digits) => digits !== "" && Number.isFinite(Number(digits)))
      .transform(Number),
  ])
  .optional()
  .catch(undefined)

// An amount held as a number or as shown text, such as "GHS 94,400.00", as a
// number. Undefined for anything else.
export function amountOf(value: JsonValue | undefined): number | undefined {
  return amount.parse(value)
}

// A table's rows: anything that is not a row is an empty one.
const tableRows = z.array(z.record(z.string(), z.json()).catch({})).catch([])

// A share, in percent, of a total, to the pesewa. Undefined while either is
// missing.
export function computedAmount(
  percentage: JsonValue | undefined,
  total: JsonValue | undefined
): number | undefined {
  const share = amount.parse(percentage)
  const of = amount.parse(total)

  return share === undefined || of === undefined
    ? undefined
    : Math.round(of * share) / 100
}

// Two amounts multiplied, to the pesewa, such as a quantity times a unit
// price. Undefined while either is missing.
export function computedProduct(
  times: JsonValue | undefined,
  by: JsonValue | undefined
): number | undefined {
  const left = amount.parse(times)
  const right = amount.parse(by)

  return left === undefined || right === undefined
    ? undefined
    : Math.round(left * right * 100) / 100
}

export function hasComputedColumns(fields: readonly Field[]) {
  return fields.some(
    (field) =>
      field.type === "table" &&
      field.columns.some((column) => column.computed !== undefined)
  )
}

const day = z.iso.date().optional().catch(undefined)

// The weekdays, Monday to Friday, from one YYYY-MM-DD day to another, both
// counted, such as 15 for a three-week phase. Undefined while either day is
// missing, or the end is before the start.
export function weekdaysBetween(
  from: JsonValue | undefined,
  to: JsonValue | undefined
): number | undefined {
  const start = day.parse(from)
  const end = day.parse(to)

  if (!start || !end || end < start) {
    return undefined
  }

  const dayMs = 24 * 60 * 60 * 1000
  const first = Date.parse(`${start}T00:00:00Z`)
  const total = Math.round((Date.parse(`${end}T00:00:00Z`) - first) / dayMs) + 1
  const weekday = new Date(first).getUTCDay()

  // Whole weeks hold five weekdays each; the days left over are counted one
  // by one from the start's day of the week.
  let days = Math.floor(total / 7) * 5

  for (let offset = 0; offset < total % 7; offset++) {
    const each = (weekday + offset) % 7

    if (each !== 0 && each !== 6) {
      days++
    }
  }

  return days
}

// A number of days as the sheet writes it, such as "15 Days" or "1 Day".
export function daysText(days: number): string {
  return `${days} ${days === 1 ? "Day" : "Days"}`
}

// Whether a column is worked out as working days, so what it adds up to is
// shown in days, not money.
export function countsDays(column: Column | undefined): boolean {
  return column?.computed !== undefined && "weekdaysFrom" in column.computed
}

// How one computed column is worked out: working days between two dates,
// or an amount from two others.
type Rule =
  | { key: string; kind: "weekdays"; weekdaysFrom: string; to: string }
  | {
      key: string
      kind: "amount"
      times: string
      by: string
      share: boolean
      inRow: boolean
    }

// Every table's rows with their computed cells worked out (`computed`), as
// `shown` text, such as "GHS 37,760.00", or as numbers for storing. A cell
// whose inputs are missing is left empty. Only the tables with such columns.
export function computedCells(
  fields: readonly Field[],
  values: JsonObject,
  as: "shown" | "stored" = "shown"
): JsonObject {
  const result: JsonObject = {}

  for (const field of fields) {
    if (field.type !== "table") {
      continue
    }

    const computed = field.columns.flatMap((column): Rule[] => {
      const rule = column.computed

      if (!rule) {
        return []
      }

      if ("weekdaysFrom" in rule) {
        return [{ key: column.key, kind: "weekdays", ...rule }]
      }

      // A percentage column is a share of `by`; any other is multiplied by
      // it. `by` is a column of the same row when the table has one, such
      // as D3.4's Unit Price, or else a field of the tool, such as D3.1's
      // Total Project Value.
      return [
        {
          key: column.key,
          kind: "amount",
          ...rule,
          share:
            field.columns.find((each) => each.key === rule.times)?.type ===
            "percentage",
          inRow: field.columns.some((each) => each.key === rule.by),
        },
      ]
    })

    if (computed.length === 0) {
      continue
    }

    // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
    const rows = tableRows.parse(values[field.key]) as JsonObject[]

    result[field.key] = rows.map((row) => {
      const next: JsonObject = { ...row }

      for (const column of computed) {
        if (column.kind === "weekdays") {
          const days = weekdaysBetween(row[column.weekdaysFrom], row[column.to])

          next[column.key] =
            as === "stored"
              ? (days ?? null)
              : days === undefined
                ? ""
                : daysText(days)

          continue
        }

        const by = column.inRow ? row[column.by] : values[column.by]

        const due = column.share
          ? computedAmount(row[column.times], by)
          : computedProduct(row[column.times], by)

        if (as === "stored") {
          next[column.key] = due ?? null
        } else {
          next[column.key] = due === undefined ? "" : ghs(due)
        }
      }

      return next
    })
  }

  return result
}

// What a table's column adds up to, to two places.
export function columnSum(rows: JsonValue | undefined, column: string): number {
  // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
  const parsed = tableRows.parse(rows) as JsonObject[]

  const sum = parsed.reduce(
    (total, row) => total + (amount.parse(row[column]) ?? 0),
    0
  )

  return Math.round(sum * 100) / 100
}
