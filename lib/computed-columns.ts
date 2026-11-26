import { z } from "zod"

import type { JsonObject, JsonValue } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import type { Field } from "@/lib/tool-definition"

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

export function hasComputedColumns(fields: readonly Field[]) {
  return fields.some(
    (field) =>
      field.type === "table" &&
      field.columns.some((column) => column.computed !== undefined)
  )
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

    const computed = field.columns.flatMap((column) =>
      column.computed ? [{ key: column.key, ...column.computed }] : []
    )

    if (computed.length === 0) {
      continue
    }

    // SAFETY: z.json() parses to JSON values, which is what a JsonObject holds.
    const rows = tableRows.parse(values[field.key]) as JsonObject[]

    result[field.key] = rows.map((row) => {
      const next: JsonObject = { ...row }

      for (const column of computed) {
        const due = computedAmount(row[column.times], values[column.by])

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
