import { z } from "zod"

import type { JsonObject, JsonValue } from "@/db/schema"
import { fileIdOf } from "@/lib/file-reference"
import { sourceName } from "@/server/pdf/preview-source"
import type {
  Column,
  Field,
  TableField,
  ToolDefinition,
} from "@/server/tools/define-tool"

// What an empty answer shows.
export const EMPTY = "—"

// A tool's record laid out as a document: the sections of the tool page, in
// its order and with its titles, each holding text only. Building it apart
// from drawing it keeps every rule about what is shown testable.
export type Section =
  | { kind: "rows"; title: string; rows: { label: string; value: string }[] }
  | {
      kind: "table"
      title: string
      columns: string[]
      rows: string[][]
      total?: string[]
    }
  | { kind: "text"; title: string; text: string }
  | { kind: "list"; title: string; items: string[] }

// A saved answer is JSON; a missing one reads as undefined.
type Answer = JsonValue | undefined

type Row = Record<string, JsonValue>

const signature = z.object({ signedBy: z.string(), signedAt: z.string() })

const flags = z.record(z.string(), z.boolean()).catch({})

const row = z.record(z.string(), z.json())

const tableRows = z.array(row).catch([])

// A typed or worked-out amount: a number, or text that reads as one.
const amount = z.coerce.number().refine(Number.isFinite)

// Text, a number or a yes or no, as one line of text.
const scalar = z.union([z.string(), z.number(), z.boolean()]).transform(String)

const isoDay = /^\d{4}-\d{2}-\d{2}$/

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

function day(text: string) {
  const when = new Date(text)

  return Number.isNaN(when.getTime()) ? text : dayFormat.format(when)
}

function ghs(total: number) {
  return `GHS ${money.format(total)}`
}

// A file shows as its name: an upload by the name it was sent with, a web
// link as the link.
function fileName(reference: string, names: ReadonlyMap<string, string>) {
  const id = fileIdOf(reference)

  if (id) {
    return names.get(id) ?? "Uploaded file"
  }

  return reference
}

// An answer that holds text, a number or a yes or no, by the type of its
// field or column.
function plainText(
  cell: Field | Column,
  text: string,
  names: ReadonlyMap<string, string>
) {
  switch (cell.type) {
    case "boolean": {
      return text === "true" ? "Yes" : "No"
    }

    case "currency": {
      const parsed = amount.safeParse(text)

      return parsed.success ? ghs(parsed.data) : text
    }

    case "percentage": {
      return `${text}%`
    }

    case "date": {
      return isoDay.test(text) ? day(`${text}T00:00:00Z`) : text
    }

    case "fileLink": {
      return fileName(text, names)
    }

    default: {
      return text
    }
  }
}

// One answer as text, by the type of the field or column that holds it.
export function textOf(
  cell: Field | Column,
  answer: Answer,
  names: ReadonlyMap<string, string> = new Map()
): string {
  switch (cell.type) {
    case "signature": {
      const signed = signature.safeParse(answer)

      return signed.success
        ? `Signed by ${signed.data.signedBy} on ${day(signed.data.signedAt)}`
        : "Not signed"
    }

    case "checklist": {
      const answers = flags.parse(answer)

      return cell.items
        .map((item) => `${item}: ${answers[item] ? "Yes" : "No"}`)
        .join("\n")
    }

    case "instruction": {
      return cell.content
    }

    case "staticList": {
      return cell.items.join("\n")
    }

    // The PDF it shows is not drawn into this one, only named.
    case "pdfPreview": {
      return sourceName(cell.source)
    }

    case "table": {
      return EMPTY
    }

    default: {
      const text = scalar.safeParse(answer)

      return text.success && text.data !== ""
        ? plainText(cell, text.data, names)
        : EMPTY
    }
  }
}

// The table's rows as saved. A table with fixed rows always has them, so
// before anything is saved they show with only their labels.
function rowsOf(field: TableField, answer: Answer): Row[] {
  const saved = tableRows.parse(answer)

  if (saved.length > 0 || !field.prefilledRows) {
    return saved
  }

  const first = field.columns[0]!.key

  return field.prefilledRows.map((label) => ({ [first]: label }))
}

function totalOf(field: TableField, rows: Row[], key: string) {
  const sum = rows.reduce((total, each) => {
    const parsed = amount.safeParse(each[key] ?? "")

    return each[key] === "" || !parsed.success ? total : total + parsed.data
  }, 0)

  return field.columns.map((column, index) => {
    if (column.key === key) {
      return ghs(sum)
    }

    return index === 0 ? (field.subtotalLabel ?? "Subtotal") : ""
  })
}

function tableSection(
  field: TableField,
  answer: Answer,
  names: ReadonlyMap<string, string>
): Section {
  const rows = rowsOf(field, answer)

  const section: Section = {
    kind: "table",
    title: field.label,
    columns: field.columns.map((column) => column.label),
    rows: rows.map((each) =>
      field.columns.map((column) => textOf(column, each[column.key], names))
    ),
  }

  if (field.subtotal !== undefined) {
    section.total = totalOf(field, rows, field.subtotal)
  }

  return section
}

// A run of plain fields shares one box, as on the tool page; a table, a
// checklist, a signature and the blocks that are only shown get their own.
const groupTypes = new Set([
  "table",
  "checklist",
  "signature",
  "instruction",
  "staticList",
])

type Run = { title?: string; fields: Field[] }

function groupSection(
  field: Field,
  answer: Answer,
  names: ReadonlyMap<string, string>
): Section {
  switch (field.type) {
    case "table": {
      return tableSection(field, answer, names)
    }

    case "checklist": {
      const answers = flags.parse(answer)

      return {
        kind: "table",
        title: field.label,
        columns: ["Item", "Done"],
        rows: field.items.map((item) => [item, answers[item] ? "Yes" : "No"]),
      }
    }

    case "staticList": {
      return { kind: "list", title: field.label, items: field.items }
    }

    default: {
      return {
        kind: "text",
        title: field.label,
        text: textOf(field, answer, names),
      }
    }
  }
}

// The sections of a tool's record, in the tool page's order and with its
// titles. `values` is what the page shows: the saved answers with the
// system's over them.
export function sectionsOf(
  tool: ToolDefinition,
  values: JsonObject,
  names: ReadonlyMap<string, string> = new Map()
): Section[] {
  const parts: (Run | Field)[] = []

  for (const field of tool.fields) {
    const last = parts.at(-1)

    if (groupTypes.has(field.type)) {
      parts.push(field)
    } else if (last && "fields" in last && last.title === field.section) {
      last.fields.push(field)
    } else {
      parts.push({ title: field.section, fields: [field] })
    }
  }

  const firstRun = parts.findIndex((part) => "fields" in part)

  return parts.map((part, index): Section => {
    if (!("fields" in part)) {
      return groupSection(part, values[part.key], names)
    }

    return {
      kind: "rows",
      title: part.title ?? (index === firstRun ? "Details" : "More details"),
      rows: part.fields.map((field) => ({
        label: field.label,
        value: textOf(field, values[field.key], names),
      })),
    }
  })
}

const reference = z.string().catch("")

// The upload IDs a record's file fields and file cells hold, so their names
// can be read in one go.
export function uploadIdsOf(tool: ToolDefinition, values: JsonObject) {
  return tool.fields.flatMap((field) => {
    if (field.type === "fileLink") {
      return fileIdOf(reference.parse(values[field.key])) ?? []
    }

    if (field.type !== "table") {
      return []
    }

    const keys = field.columns
      .filter((column) => column.type === "fileLink")
      .map((column) => column.key)

    return tableRows
      .parse(values[field.key])
      .flatMap((each) =>
        keys.flatMap((key) => fileIdOf(reference.parse(each[key])) ?? [])
      )
  })
}

const liveTable = z.array(row)

// What a tool's live sums add over the saved answers: a field's value by its
// key, and a table's system cells row by row.
export function withLive(values: JsonObject, live: JsonObject | undefined) {
  if (!live) {
    return values
  }

  const merged: JsonObject = { ...values }

  for (const [key, value] of Object.entries(live)) {
    const sums = liveTable.safeParse(value)
    const saved = liveTable.safeParse(values[key])

    if (sums.success && saved.success) {
      merged[key] = saved.data.map((each, index) => ({
        ...each,
        ...sums.data[index],
      }))
    } else if (value !== "" && value !== null) {
      merged[key] = value
    }
  }

  return merged
}
