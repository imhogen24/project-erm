import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import type {
  Column,
  Field,
  TableField,
  ToolDefinition,
} from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

// `row` (counted from 0) and `column` are set when the problem is in one cell
// of a table field.
export type FieldError = {
  field: string
  message: string
  row?: number
  column?: string
}

export type Validation =
  { ok: true; payload: JsonObject } | { ok: false; errors: FieldError[] }

export class UnknownToolError extends Error {}

export class ValidationError extends Error {
  readonly errors: FieldError[]

  constructor(errors: FieldError[]) {
    super(
      errors
        .map((error) =>
          [
            error.field,
            error.row === undefined ? undefined : `row ${error.row + 1}`,
            error.column,
          ]
            .filter((part) => part !== undefined)
            .join(", ")
            .concat(`: ${error.message}`)
        )
        .join("; ")
    )
    this.errors = errors
  }
}

const systemOnly = "Filled in by the system, so it cannot be written"

const readOnly = "Read-only, so it cannot be written"

const systemSets = "Set by the system, so it cannot be chosen"

const percentage = "Must be a percentage from 0 to 100"

function cellSchema(cell: Field | Column): z.ZodType {
  if (cell.inherited || cell.systemFilled) {
    return z.never({ error: systemOnly })
  }

  switch (cell.type) {
    case "text":
    case "longText":
      return z.string({ error: "Must be text" })
    case "number":
      return z.number({ error: "Must be a number" })
    case "currency":
      return z.number({ error: "Must be an amount" })
    case "percentage":
      return z
        .number({ error: percentage })
        .min(0, { error: percentage })
        .max(100, { error: percentage })
    case "date":
      return z.iso.date({ error: "Must be a date (YYYY-MM-DD)" })
    case "time":
      return z.iso.time({ precision: -1, error: "Must be a time (HH:MM)" })
    case "email":
      return z.email({ error: "Must be an email address" })
    case "fileLink":
      return z.url({
        protocol: /^https?$/,
        error: "Must be a web link (https://...)",
      })
    case "boolean":
      return z.boolean({ error: "Must be yes or no" })
    case "select":
      return selectSchema(cell)
    case "checklist":
      return z.strictObject(
        Object.fromEntries(
          cell.items.map((item) => [
            item,
            z.boolean({ error: "Must be yes or no" }).optional(),
          ])
        ),
        { error: "Must be a checklist" }
      )
    case "signature":
      return z.never({ error: systemOnly })
    case "instruction":
    case "staticList":
      return z.never({ error: readOnly })
    case "table":
      return tableSchema(cell)
  }
}

// A system option is a valid value, but only the system may set it, so the
// form is refused it.
function selectSchema(cell: Extract<Field | Column, { type: "select" }>) {
  const system = cell.systemOptions ?? []
  const choosable = cell.options.filter((option) => !system.includes(option))

  return z
    .enum(cell.options, { error: `Must be one of: ${choosable.join(", ")}` })
    .refine((value) => !system.includes(value), { error: systemSets })
}

function tableSchema(table: TableField) {
  const row = z.strictObject(
    Object.fromEntries(
      table.columns.map((column) => [column.key, cellSchema(column).optional()])
    ),
    { error: "Must be a row of cells" }
  )

  return z
    .array(row, { error: "Must be a list of rows" })
    .superRefine((rows, context) => {
      const labels = table.prefilledRows

      if (!labels) {
        return
      }

      if (rows.length !== labels.length) {
        context.addIssue({
          code: "custom",
          message: `Must keep its ${labels.length} fixed rows: ${labels.join(", ")}`,
        })

        return
      }

      const first = table.columns[0]!.key

      rows.forEach((entry, index) => {
        if (entry[first] !== labels[index]) {
          context.addIssue({
            code: "custom",
            path: [index, first],
            message: `Must stay "${labels[index]}"`,
          })
        }
      })
    })
}

// Every field is optional here. Whether a required field is filled is checked
// separately, and only at submit.
function payloadSchema(fields: Field[]) {
  return z.strictObject(
    Object.fromEntries(
      fields.map((field) => [field.key, cellSchema(field).optional()])
    )
  )
}

// Turns one problem Zod found into the errors it names. A path runs field,
// then row and column for a table cell, then item for a checklist.
function toFieldErrors(tool: ToolDefinition, issue: z.core.$ZodIssue) {
  const [key, step, column] = issue.path
  const field = tool.fields.find((entry) => entry.key === key)
  const row = z.number().safeParse(step).data
  const inTable = field?.type === "table" && row !== undefined

  const at = {
    field: String(key),
    ...(inTable && { row }),
    ...(inTable && column !== undefined && { column: String(column) }),
  }

  if (issue.code !== "unrecognized_keys") {
    return [{ ...at, message: issue.message }]
  }

  return issue.keys.map((unknown): FieldError => {
    if (key === undefined) {
      return { field: unknown, message: "Not a field of this tool" }
    }

    if (inTable && column === undefined) {
      return { ...at, column: unknown, message: "Not a column of this table" }
    }

    return { ...at, message: `Not an item of this checklist: "${unknown}"` }
  })
}

const blank = z.union([
  z.undefined(),
  z.null(),
  z.string().trim().length(0),
  z.array(z.unknown()).length(0),
])

function isMissing(field: Field, value: JsonObject[string] | undefined) {
  if (blank.safeParse(value).success) {
    return true
  }

  if (field.type !== "checklist") {
    return false
  }

  // A checklist is filled once every item is answered.
  const answers = z.record(z.string(), z.boolean()).safeParse(value).data ?? {}

  return field.items.some((item) => !(item in answers))
}

const rowsOf = z.array(z.record(z.string(), z.unknown()))

// At submit, a required column must be answered in every row of its table.
function unansweredCells(table: TableField, value: JsonObject[string]) {
  const required = table.columns.filter((column) => column.required)

  return (rowsOf.safeParse(value).data ?? []).flatMap((row, index) =>
    required
      .filter((column) => blank.safeParse(row[column.key]).success)
      .map((column): FieldError => ({
        field: table.key,
        row: index,
        column: column.key,
        message: "Required",
      }))
  )
}

// A select option that is refused while some fixed rows of a table hold a
// value. The refusal names those rows by their fixed labels.
function blockedChoice(
  tool: ToolDefinition,
  field: Field,
  payload: JsonObject
): FieldError | undefined {
  if (
    field.type !== "select" ||
    !field.blockedWhile ||
    payload[field.key] !== field.blockedWhile.option
  ) {
    return undefined
  }

  const rule = field.blockedWhile
  const table = tool.fields.find((entry) => entry.key === rule.table)
  const labels = table?.type === "table" ? (table.prefilledRows ?? []) : []

  const named = (rowsOf.safeParse(payload[rule.table]).data ?? []).flatMap(
    (row, index) =>
      row[rule.column] === rule.value
        ? [`"${labels[index] ?? `Row ${index + 1}`}"`]
        : []
  )

  return named.length === 0
    ? undefined
    : { field: field.key, message: `${rule.message}: ${named.join(", ")}` }
}

// Checks `payload` against the tool's definition and returns every problem
// together. Types, options, table cells, blocked options, and unknown,
// inherited, system-filled or read-only fields are checked on every write.
// Required fields and required table columns are checked only when
// `forSubmit` is set, so a draft can be saved incomplete.
export function validateRecord(
  toolId: string,
  payload: JsonObject,
  options: { forSubmit: boolean }
): Validation {
  const tool = tools.getTool(toolId)

  if (!tool) {
    throw new UnknownToolError(`${toolId} has no tool definition`)
  }

  const errors: FieldError[] = []
  const result = payloadSchema(tool.fields).safeParse(payload)

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(...toFieldErrors(tool, issue))
    }
  }

  const wrong = new Set(errors.map((error) => error.field))

  for (const field of tool.fields) {
    if (wrong.has(field.key)) {
      continue
    }

    const blocked = blockedChoice(tool, field, payload)

    if (blocked) {
      errors.push(blocked)
    }

    if (!options.forSubmit) {
      continue
    }

    if (field.required && isMissing(field, payload[field.key])) {
      errors.push({ field: field.key, message: "Required" })
    } else if (field.type === "table") {
      errors.push(...unansweredCells(field, payload[field.key]))
    }
  }

  return errors.length === 0 ? { ok: true, payload } : { ok: false, errors }
}

export function assertValid(
  toolId: string,
  payload: JsonObject,
  options: { forSubmit: boolean }
): JsonObject {
  const validation = validateRecord(toolId, payload, options)

  if (!validation.ok) {
    throw new ValidationError(validation.errors)
  }

  return validation.payload
}
