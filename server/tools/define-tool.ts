import { z } from "zod"

import { roles } from "@/db/schema"
import { placeholdersIn } from "@/lib/placeholders"

const fieldKey = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, "A field key is a camelCase name")

// `column` is set when the value comes from one column of a table field.
const toolLink = z.strictObject({
  tool: z.string().min(1),
  field: z.string().min(1),
  column: z.string().min(1).optional(),
})

const requestColumn = z.string().min(1)

// Reads a column of the project's saved web request. Where the Tier 1 and
// Tier 3 forms hold the same answer under different columns, it names the
// column for each tier. One column is the same column on both.
const requestLink = z.strictObject({
  request: z.union([
    requestColumn.transform((column) => ({ Tier_1: column, Tier_3: column })),
    z.strictObject({ Tier_1: requestColumn, Tier_3: requestColumn }),
  ]),
})

const inheritedLink = z.union([toolLink, requestLink])

export type RequestLink = z.output<typeof requestLink>

// `systemFilled` is shown in the form but filled by the system from outside
// the tool, such as the saved website request, so the form never writes it.
// `section` names the box a field is drawn in, such as "1.0 Dispatch
// metadata": fields next to each other with the same section share one box.
// Only shown; a table cell ignores it.
const cellBase = {
  key: fieldKey,
  label: z.string().min(1),
  inherited: inheritedLink.optional(),
  systemFilled: z.boolean().optional(),
  // What a system-filled field says while it is still empty, such as "Filled
  // in when the email is sent". Only shown.
  systemNote: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
}

const distinctTexts = z
  .array(z.string().min(1))
  .min(1)
  .refine((value) => new Set(value).size === value.length, {
    message: "Two entries cannot be the same",
  })

// The types a field and a table cell share.
const plain = z.object({
  ...cellBase,
  type: z.enum([
    "text",
    "longText",
    "number",
    "date",
    "boolean",
    "currency",
    "percentage",
    "email",
    "time",
    "fileLink",
  ]),
})

// Records who signed and when. It is written only by signing, never in the
// form. `signedBy` names the roles that may sign it; the registry refuses a
// signature field that names none.
const signature = z.object({
  ...cellBase,
  type: z.literal("signature"),
  signedBy: z.array(z.enum(roles)).min(1).optional(),
})

// `systemOptions` are options only the system sets. They are shown, but the
// form can never choose them.
const select = z.object({
  ...cellBase,
  type: z.literal("select"),
  options: z.array(z.string().min(1)).min(1),
  systemOptions: z.array(z.string().min(1)).min(1).optional(),
})

// Refuses `option` while any row of the `table` field has `value` in its
// `column`. The refusal is `message`, followed by the first cell of each such
// row, so the table needs fixed rows to name them.
const blockedWhile = z.object({
  option: z.string().min(1),
  table: fieldKey,
  column: fieldKey,
  value: z.string().min(1),
  message: z.string().min(1),
})

export type BlockedWhile = z.output<typeof blockedWhile>

const strangerSystemOption = "A system option must be one of the options"

// Only a select has options, so any other field passes.
function holdsSystemOptions(cell: {
  type: string
  options?: string[]
  systemOptions?: string[]
}) {
  return (cell.systemOptions ?? []).every((option) =>
    cell.options?.includes(option)
  )
}

// Each item is answered yes or no.
const checklist = z.object({
  ...cellBase,
  type: z.literal("checklist"),
  items: distinctTexts,
})

// Read-only text shown in the form. It is never stored.
const instruction = z.object({
  ...cellBase,
  type: z.literal("instruction"),
  content: z.string().min(1),
})

// A read-only list shown in the form. It is never stored.
const staticList = z.object({
  ...cellBase,
  type: z.literal("staticList"),
  items: distinctTexts,
})

// A file kept with the app in `documents/`, such as "company-sla.pdf".
export const storedPdfName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*\.pdf$/, "A stored PDF is a lowercase .pdf name")

// A PDF shown for reference, read only, and never stored: the project's record
// of another tool, as it is now, or a PDF kept with the app. `title` is the
// stored PDF's name as people know it, such as "Company SLA".
const pdfPreview = z.object({
  ...cellBase,
  type: z.literal("pdfPreview"),
  source: z.union([
    z.strictObject({ tool: z.string().min(1) }),
    z.strictObject({ file: storedPdfName, title: z.string().min(1) }),
  ]),
})

export type PreviewSource = z.output<typeof pdfPreview>["source"]

// A required column must be answered in every row, but only at submit.
// `numbered` makes a column the app numbers itself, "<numbered>.<row>", such
// as 2.1, 2.2 for an SN column: never typed and never stored. `startsAs` is
// the option a select column starts on in each new row, such as "Active".
const columnRequired = {
  required: z.boolean().optional(),
  numbered: z
    .string()
    .regex(/^\d+(\.\d+)*$/, "A numbered column counts from a number, such as 2")
    .optional(),
  startsAs: z.string().min(1).optional(),
}

const column = z.discriminatedUnion("type", [
  plain.extend(columnRequired),
  signature.extend(columnRequired),
  select.extend(columnRequired),
  checklist.extend(columnRequired),
  instruction.extend(columnRequired),
  staticList.extend(columnRequired),
])

type Column = z.output<typeof column>

// The form never writes these, so they can never be required of it.
const unwritten = ["signature", "instruction", "staticList", "pdfPreview"]

function isWritten(cell: Column) {
  return !(
    cell.inherited ||
    cell.systemFilled ||
    cell.numbered ||
    unwritten.includes(cell.type)
  )
}

const required = { required: z.boolean().default(false) }

// `prefilledRows` are fixed labels for the first column: the table always has
// exactly these rows, in this order. `subtotal` names a currency column to add
// up. `lockedRows` are the same kind of labels, but the table may also hold
// rows after them that the person adds, names and removes. `optionalRows` names
// rows whose required columns may stay empty. `startsWithRow` opens a table
// with no locked rows on one empty row. `readOnly` shows the table in the form without letting the form change
// it: the system and the screens built for it write its rows. `fixedRows` are
// rows the table always starts with, each fixing the values of the columns it
// names, which can never be edited or removed; its other columns stay
// editable, and rows the person adds may follow them, as with `lockedRows`.
const table = z
  .object({
    ...cellBase,
    ...required,
    type: z.literal("table"),
    columns: z.array(column).min(1),
    prefilledRows: distinctTexts.optional(),
    lockedRows: distinctTexts.optional(),
    fixedRows: z
      .array(z.record(fieldKey, z.string().min(1)))
      .min(1)
      .optional(),
    optionalRows: distinctTexts.optional(),
    // A short note shown under a fixed or locked row's label, such as
    // "Material" under "M". Only shown; never stored.
    rowNotes: z.record(z.string().min(1), z.string().min(1)).optional(),
    startsWithRow: z.boolean().optional(),
    subtotal: fieldKey.optional(),
    // What the subtotal row is called, as the sheet names it.
    subtotalLabel: z.string().min(1).optional(),
    readOnly: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const keys = value.columns.map((entry) => entry.key)

    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Two columns cannot share a key",
      })
    }

    if (
      [value, ...value.columns].some(
        (cell) => cell.inherited && "request" in cell.inherited
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["inherited"],
        message: "A web request answer is one line, so it cannot fill a table",
      })
    }

    value.columns.forEach((entry, index) => {
      if (!holdsSystemOptions(entry)) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "systemOptions"],
          message: strangerSystemOption,
        })
      }

      if (entry.required && !isWritten(entry)) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "required"],
          message: "A column the form never writes is never required",
        })
      }
    })

    if (value.subtotal !== undefined) {
      const totalled = value.columns.find(
        (entry) => entry.key === value.subtotal
      )

      if (totalled?.type !== "currency") {
        context.addIssue({
          code: "custom",
          path: ["subtotal"],
          message: "A subtotal adds up a currency column of the table",
        })
      }
    }

    if (value.prefilledRows && value.lockedRows) {
      context.addIssue({
        code: "custom",
        path: ["lockedRows"],
        message: "A table has fixed rows or locked rows, not both",
      })
    }

    if (value.fixedRows && (value.prefilledRows || value.lockedRows)) {
      context.addIssue({
        code: "custom",
        path: ["fixedRows"],
        message:
          "A table has fixed rows of several columns, or labels, not both",
      })
    }

    value.fixedRows?.forEach((row, index) => {
      for (const [key, text] of Object.entries(row)) {
        const problem = fixedCellProblem(
          value.columns.find((entry) => entry.key === key),
          text
        )

        if (problem) {
          context.addIssue({
            code: "custom",
            path: ["fixedRows", index, key],
            message: problem,
          })
        }
      }
    })

    value.columns.forEach((entry, index) => {
      if (entry.numbered && entry.type !== "text") {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "numbered"],
          message: "Only a text column is numbered",
        })
      }

      if (
        entry.startsAs !== undefined &&
        !(entry.type === "select" && entry.options.includes(entry.startsAs))
      ) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "startsAs"],
          message: "A column starts as one of its select's options",
        })
      }
    })

    if (
      value.startsWithRow &&
      (value.prefilledRows || value.lockedRows || value.fixedRows)
    ) {
      context.addIssue({
        code: "custom",
        path: ["startsWithRow"],
        message: "Only a table with no locked or fixed rows starts on a row",
      })
    }

    for (const key of ["prefilledRows", "lockedRows"] as const) {
      const labels = value[key]

      if (labels && !holdsLabels(value.columns[0], labels)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message:
            "Prefilled rows need a first column of text, or a select whose options include every label, that is not inherited",
        })
      }
    }

    const named = value.prefilledRows ?? value.lockedRows ?? []

    if (value.optionalRows?.some((label) => !named.includes(label))) {
      context.addIssue({
        code: "custom",
        path: ["optionalRows"],
        message: "An optional row must be one of the fixed or locked rows",
      })
    }

    if (
      Object.keys(value.rowNotes ?? {}).some((label) => !named.includes(label))
    ) {
      context.addIssue({
        code: "custom",
        path: ["rowNotes"],
        message: "A row note must name one of the fixed or locked rows",
      })
    }
  })

// A fixed cell is a column the form would write, holding text it can hold.
function fixedCellProblem(cell: Column | undefined, text: string) {
  if (!cell) {
    return "Not a column of this table"
  }

  if (!isWritten(cell)) {
    return "A fixed row fixes only a column the form writes"
  }

  if (cell.type === "select") {
    return cell.options.includes(text)
      ? undefined
      : `"${text}" is not one of the options`
  }

  return cell.type === "text" || cell.type === "longText"
    ? undefined
    : "A fixed row fixes only text or a select"
}

function holdsLabels(first: Column | undefined, labels: string[]) {
  if (!first || first.inherited) {
    return false
  }

  if (first.type === "select") {
    return labels.every((label) => first.options.includes(label))
  }

  return first.type === "text" || first.type === "longText"
}

const field = z
  .discriminatedUnion("type", [
    plain.extend(required),
    signature.extend(required),
    select.extend({ ...required, blockedWhile: blockedWhile.optional() }),
    checklist.extend(required),
    instruction.extend(required),
    staticList.extend(required),
    pdfPreview.extend(required),
    table,
  ])
  .refine(holdsSystemOptions, { message: strangerSystemOption })
  .refine((value) => !(value.inherited && value.required), {
    message:
      "An inherited field is filled in by the system, so it is never required",
  })
  .refine((value) => !(value.required && unwritten.includes(value.type)), {
    message:
      "A signature, instruction, static list or PDF preview is never written in the form, so it is never required",
  })
  .refine((value) => !(value.systemFilled && value.required), {
    message:
      "A system-filled field is filled in by the system, so it is never required",
  })
  .refine(
    (value) =>
      !(value.type === "pdfPreview" && (value.inherited || value.systemFilled)),
    { message: "A PDF preview shows a document, so it holds no value to fill" }
  )

// The 13 workbooks. A registered tool belongs to one of them, and its workbook
// is read only from here, never from the letters of its id.
export const workbooks = [
  "wb01",
  "wb02",
  "wb03",
  "wb04",
  "wb05",
  "wb06",
  "wb07",
  "wb08",
  "wb09",
  "wb10",
  "wb11",
  "wb12",
  "wb13",
] as const

export type Workbook = (typeof workbooks)[number]

// A tool for one tier only can name the tool it takes the place of on that
// tier's track. The project's service track picks which variants show.
const toolDefinition = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    workbook: z.string().min(1),
    tier: z
      .union([z.literal(1), z.literal(3), z.literal("both")])
      .default("both"),
    replaces: z.string().min(1).optional(),
    // The tool has no Submit for approval: a step of its own locks it, such
    // as D1.4's Send. Every tool saves by itself as it is typed.
    withoutSubmit: z.boolean().optional(),
    // The client reads the record only once it is locked: before, it holds
    // IMHOGEN's working notes.
    clientReadsOnceLocked: z.boolean().optional(),
    // Submitting locks the record straight away: the tool has no approver.
    locksOnSubmit: z.boolean().optional(),
    // What each `[Name]` in a table's fixed rows is filled in from when shown
    // or exported: "system", worked out from the project's other records, or
    // a field of this record, such as a percentage typed beside the table.
    fills: z
      .record(
        z.string().min(1),
        z.union([z.literal("system"), z.strictObject({ field: fieldKey })])
      )
      .optional(),
    // System-filled fields that must hold a value before the record can be
    // submitted, each with what to say until then, such as an invite sent.
    submitNeeds: z
      .array(z.strictObject({ field: fieldKey, message: z.string().min(1) }))
      .optional(),
    fields: z.array(field).min(1),
  })
  .refine(
    (value) =>
      new Set(value.fields.map((entry) => entry.key)).size ===
      value.fields.length,
    { message: "Two fields cannot share a key" }
  )
  .refine((value) => !(value.replaces && value.tier === "both"), {
    message: "Only a tool for one tier can replace another",
  })
  .refine((value) => value.replaces !== value.id, {
    message: "A tool cannot replace itself",
  })
  .refine((value) => !(value.locksOnSubmit && value.withoutSubmit), {
    message: "A tool without Submit cannot lock on submit",
  })
  .superRefine((value, context) => {
    for (const problem of fillProblems(value.fields, value.fills ?? {})) {
      context.addIssue({ code: "custom", path: ["fills"], message: problem })
    }

    value.fields.forEach((entry, index) => {
      if (entry.type !== "select" || !entry.blockedWhile) {
        return
      }

      const problem = blockedWhileProblem(
        entry.options,
        entry.blockedWhile,
        value.fields
      )

      if (problem) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "blockedWhile"],
          message: problem,
        })
      }
    })
  })

type FieldOutput = z.output<typeof field>

type Fills = Record<string, "system" | { field: string }>

// Every `[Name]` in fixed text must say where it is filled in from, and a fill
// from a field must name a field of the tool that holds one value.
function fillProblems(fields: FieldOutput[], fills: Fills) {
  const named = fields.flatMap((entry) =>
    entry.type === "table"
      ? (entry.fixedRows ?? []).flatMap((row) =>
          Object.values(row).flatMap(placeholdersIn)
        )
      : []
  )

  const unnamed = [...new Set(named)].flatMap((name) =>
    name in fills ? [] : [`"[${name}]" is not listed in fills`]
  )

  const strays = Object.entries(fills).flatMap(([name, source]) => {
    if (source === "system") {
      return []
    }

    const from = fields.find((entry) => entry.key === source.field)

    return from && from.type !== "table" && !unwritten.includes(from.type)
      ? []
      : [`"[${name}]" is filled from ${source.field}, which holds no value`]
  })

  return [...unnamed, ...strays]
}

// The rule must name one of the select's options, and a column of a table with
// fixed rows whose select can hold the value.
function blockedWhileProblem(
  options: string[],
  rule: BlockedWhile,
  fields: FieldOutput[]
) {
  if (!options.includes(rule.option)) {
    return `"${rule.option}" is not one of the options`
  }

  const table = fields.find((entry) => entry.key === rule.table)

  if (table?.type !== "table" || !table.prefilledRows) {
    return `${rule.table} is not a table with fixed rows`
  }

  const watched = table.columns.find((entry) => entry.key === rule.column)

  if (watched?.type !== "select" || !watched.options.includes(rule.value)) {
    return `${rule.table}.${rule.column} is not a select with the option "${rule.value}"`
  }

  return undefined
}

export type ToolInput = z.input<typeof toolDefinition>

export type ToolDefinition = z.output<typeof toolDefinition>

export type Field = ToolDefinition["fields"][number]

export type FieldType = Field["type"]

export type TableField = Extract<Field, { type: "table" }>

export type SignatureField = Extract<Field, { type: "signature" }>

export type PdfPreviewField = Extract<Field, { type: "pdfPreview" }>

export type { Column }

export type Tier = ToolDefinition["tier"]

export function defineTool(input: ToolInput): ToolDefinition {
  return toolDefinition.parse(input)
}
