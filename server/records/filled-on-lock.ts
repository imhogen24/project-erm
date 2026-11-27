import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, type JsonObject } from "@/db/schema"
import { columnSum } from "@/lib/computed-columns"
import type { Transaction } from "@/server/audit/audit"
import { tools } from "@/server/tools/registry"

import { shownFor } from "./signatures"
import type { FieldError } from "./validate"

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(when: Date) {
  return when.toISOString().slice(0, 10)
}

// The time in Ghana, which keeps UTC, as HH:MM.
function timeOf(when: Date) {
  return when.toISOString().slice(11, 16)
}

// What the tool's fields filled on lock hold as the record locks now: the
// name of the person who submitted it, the day, or the time. Empty for a tool
// with none.
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
      fill === "lockedAt"
        ? dayOf(now)
        : fill === "lockedTime"
          ? timeOf(now)
          : (person?.name ?? ""),
    ])
  )
}

// A table's rows, as far as a submit rule reads them: anything else is no
// rows, which never meets the rule.
const tableRows = z.array(z.record(z.string(), z.unknown())).catch([])

type Matches =
  { field: string; equals: number } | { field: string; otherThan: number }

// Whether the number the record holds in `matches.field` agrees with the
// rule: equal to `equals`, or a number other than `otherThan`.
function agrees(payload: JsonObject, matches: Matches) {
  const value = z
    .number()
    .optional()
    .catch(undefined)
    .parse(payload[matches.field])

  if (value === undefined) {
    return false
  }

  return "equals" in matches
    ? value === matches.equals
    : value !== matches.otherThan
}

// Whether the record holds the option a submit rule needs: in the select
// field itself, or, for a table, in that column of every one of its rows; or,
// with `isNot`, any answer other than that option; or, with `some`, that
// option in at least one row; or, with `matches`, anything but that option
// unless the worked-out number agrees.
function meets(
  payload: JsonObject,
  rule:
    | { field: string; column?: string; is: string; orNoRows?: true }
    | { field: string; isNot: string }
    | { field: string; column: string; some: string }
    | { field: string; is: string; matches: Matches },
  skipped: ReadonlySet<number> = new Set()
) {
  const value = payload[rule.field]

  if ("matches" in rule) {
    return value !== rule.is || agrees(payload, rule.matches)
  }

  if ("some" in rule) {
    return tableRows
      .parse(value)
      .some(
        (row, index) => !skipped.has(index) && row[rule.column] === rule.some
      )
  }

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
// submitting needs, each with what to say about it. `rules` are the tool's
// `submitWhen` unless given, such as its `reviewWhen` as the approver signs.
export function unmetSubmitRules(
  toolId: string,
  payload: JsonObject,
  notNeeded: ReadonlyMap<string, ReadonlySet<number>> = new Map(),
  rules?: NonNullable<ReturnType<typeof tools.getTool>>["submitWhen"]
): FieldError[] {
  const tool = tools.getTool(toolId)
  const asked = rules ?? tool?.submitWhen ?? []

  // The rows the app sets as someone signs, or as the record locks, are not
  // asked of the writer.
  const setBySigning = (field: string, column: string | undefined) => {
    const table = tool?.fields.find((entry) => entry.key === field)

    return table?.type === "table"
      ? [...(table.setOnSign ?? []), ...(table.setOnLock ?? [])].flatMap(
          (rule) => (rule.column === column ? [rule.row] : [])
        )
      : []
  }

  // A table's column that must add up to a number, such as D3.1's
  // percentages to 100.
  const sums = (rules ? [] : (tool?.fields ?? [])).flatMap((field) =>
    field.type === "table" &&
    field.sumsTo &&
    columnSum(payload[field.key], field.sumsTo.column) !== field.sumsTo.value
      ? [{ field: field.key, message: field.sumsTo.message }]
      : []
  )

  // A field shown only while another answer holds, and not shown now, such
  // as D3.7's amount check when no funds came in, is not asked for, so a rule
  // on it does not apply.
  const hidden = (key: string | undefined) => {
    const field = tool?.fields.find((entry) => entry.key === key)

    return field !== undefined && !shownFor(field, payload)
  }

  const unmet = asked.flatMap((rule) => {
    const column = "column" in rule ? rule.column : undefined
    const when = "when" in rule ? rule.when : undefined

    if (hidden(rule.field) || hidden(when?.field)) {
      return []
    }

    // A rule that applies only under another answer, such as every check
    // Pass when D3.5 answers Yes, says so on that answer.
    if (when && payload[when.field] !== when.is) {
      return []
    }

    const skipped = new Set([
      ...(notNeeded.get(rule.field) ?? []),
      ...setBySigning(rule.field, column),
    ])

    return meets(payload, rule, skipped)
      ? []
      : [{ field: when?.field ?? rule.field, message: rule.message }]
  })

  return [...unmet, ...sums]
}

// The tables whose cells the app sets as the record locks (`setOnLock`), with
// those cells set, such as D3.5's conversion tasks Done when it is approved
// with Yes. Empty for a tool with none, or none whose answer holds.
export function setOnLockValues(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const set: JsonObject = {}

  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.type !== "table" || !field.setOnLock) {
      continue
    }

    const rules = field.setOnLock.filter(
      (rule) => !rule.when || payload[rule.when.field] === rule.when.is
    )

    if (rules.length === 0) {
      continue
    }

    const rows = tableRows.parse(payload[field.key]).map((row) => ({ ...row }))

    for (const rule of rules) {
      while (rows.length <= rule.row) {
        rows.push({})
      }

      rows[rule.row]![rule.column] = rule.is
    }

    // SAFETY: rows of cells read from the payload, the set cells strings.
    set[field.key] = rows as JsonObject[]
  }

  return set
}
