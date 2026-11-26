import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, type JsonObject } from "@/db/schema"
import { columnSum } from "@/lib/computed-columns"
import type { Transaction } from "@/server/audit/audit"
import { tools } from "@/server/tools/registry"

import type { FieldError } from "./validate"

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(when: Date) {
  return when.toISOString().slice(0, 10)
}

// What the tool's fields filled on lock hold as the record locks now: the
// name of the person who submitted it, or the day. Empty for a tool with none.
export async function lockValues(
  transaction: Pick<Transaction, "select">,
  record: { toolId: string; submittedBy: string | null },
  locker: string,
  now: Date
): Promise<JsonObject> {
  const fields = (tools.getTool(record.toolId)?.fields ?? []).flatMap(
    (field) =>
      "filledOnLock" in field && field.filledOnLock
        ? [{ key: field.key, fill: field.filledOnLock }]
        : []
  )

  if (fields.length === 0) {
    return {}
  }

  const submitter = record.submittedBy ?? locker

  const [person] = await transaction
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, submitter))

  return Object.fromEntries(
    fields.map(({ key, fill }) => [
      key,
      fill === "lockedAt" ? dayOf(now) : (person?.name ?? ""),
    ])
  )
}

// A table's rows, as far as a submit rule reads them: anything else is no
// rows, which never meets the rule.
const tableRows = z.array(z.record(z.string(), z.unknown())).catch([])

// Whether the record holds the option a submit rule needs: in the select
// field itself, or, for a table, in that column of every one of its rows; or,
// with `isNot`, any answer other than that option.
function meets(
  payload: JsonObject,
  rule:
    | { field: string; column?: string; is: string; orNoRows?: true }
    | { field: string; isNot: string },
  skipped: ReadonlySet<number> = new Set()
) {
  const value = payload[rule.field]

  if ("isNot" in rule) {
    const answer = z.string().catch("").parse(value)

    return answer !== "" && answer !== rule.isNot
  }

  const { column } = rule

  if (!column) {
    return value === rule.is
  }

  const rows = tableRows.parse(value)

  return (
    (rows.length > 0 || rule.orNoRows === true) &&
    rows.every((row, index) => skipped.has(index) || row[column] === rule.is)
  )
}

// The tool's select fields, or table columns, that do not yet hold the option
// submitting needs, each with what to say about it.
export function unmetSubmitRules(
  toolId: string,
  payload: JsonObject,
  notNeeded: ReadonlyMap<string, ReadonlySet<number>> = new Map()
): FieldError[] {
  const tool = tools.getTool(toolId)

  // The rows the app sets as someone signs are not asked of the writer.
  const setBySigning = (field: string, column: string | undefined) => {
    const table = tool?.fields.find((entry) => entry.key === field)

    return table?.type === "table"
      ? (table.setOnSign ?? [])
          .filter((rule) => rule.column === column)
          .map((rule) => rule.row)
      : []
  }

  // A table's column that must add up to a number, such as D3.1's
  // percentages to 100.
  const sums = (tool?.fields ?? []).flatMap((field) =>
    field.type === "table" &&
    field.sumsTo &&
    columnSum(payload[field.key], field.sumsTo.column) !== field.sumsTo.value
      ? [{ field: field.key, message: field.sumsTo.message }]
      : []
  )

  const rules = (tool?.submitWhen ?? []).flatMap((rule) => {
    const column = "column" in rule ? rule.column : undefined

    const skipped = new Set([
      ...(notNeeded.get(rule.field) ?? []),
      ...setBySigning(rule.field, column),
    ])

    return meets(payload, rule, skipped)
      ? []
      : [{ field: rule.field, message: rule.message }]
  })

  return [...rules, ...sums]
}
