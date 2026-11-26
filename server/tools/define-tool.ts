import { z } from "zod"

import { roles } from "@/db/schema"
import { placeholdersIn } from "@/lib/placeholders"
import { isSequenceName } from "@/lib/sequences"

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
  // IMHOGEN's own: the client never gets the field's value, from the server,
  // the form or the PDF, such as the hard limits kept in view before a
  // negotiation. On a table column, the client gets the table without that
  // column, such as D2.9's Baseline Limit.
  internalOnly: z.boolean().optional(),
  // Kept by the system for its own steps, such as which version of an invite
  // went, and never shown in the form or the PDF. Only a system-filled field
  // is kept this way. A table cell ignores it.
  hidden: z.boolean().optional(),
  // Shown, and asked for at submit, only while `onlyWhen` holds: the
  // project has a locked record of the `locked` tool, such as D2.10's
  // financial re-check, which only a negotiated contract (D2.9 locked)
  // needs; or this record's select `field` holds `is`, such as D2.11's
  // signatures, given in the app only for Digital Signature. A table cell
  // ignores it.
  onlyWhen: z
    .union([
      z.strictObject({ locked: z.string().min(1) }),
      z.strictObject({ field: fieldKey, is: z.string().min(1) }),
    ])
    .optional(),
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
  // Whoever signs it is told, in the app and by email, as soon as the record
  // is started, such as the FO on D2.10, who signs a record they only read.
  askedOnStart: z.boolean().optional(),
  // A system-filled field that keeps when its signer first opened the
  // record once it was their turn to sign, such as D2.11's Date Viewed.
  viewedAs: fieldKey.optional(),
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
    // A PDF uploaded to a file field of the project's record of another
    // tool, such as D2.12's executed contract.
    z.strictObject({
      upload: z.strictObject({ tool: z.string().min(1), field: fieldKey }),
    }),
    // The approved invoice of the same payment milestone cycle, as the
    // client receives it, such as the PDF D3.6 emails.
    z.strictObject({ approvedInvoice: z.literal(true) }),
  ]),
})

export type PreviewSource = z.output<typeof pdfPreview>["source"]

// What a fixed row's preview cell names: a tool's ID, such as "D1.15", or a
// file uploaded to one of its fields, as "<tool>:<field>", such as
// "D2.12:executedPdf".
export function cellPreviewSource(text: string): PreviewSource {
  const [tool, field] = text.split(":")

  return field ? { upload: { tool: tool!, field } } : { tool: text }
}

// A PDF preview as a table column: which tool each row shows is fixed by the
// table's `fixedRows`, as the tool's ID, such as { source: "D1.15" }, or an
// upload, such as { document: "D2.12:executedPdf" }. A row
// the person adds shows none.
const previewColumn = z.object({
  ...cellBase,
  type: z.literal("pdfPreview"),
})

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
  // Needed at submit only in a row whose select `column` holds `is`, such as
  // D3.5's comment on a check marked Fail, with what to say until then.
  requiredWhen: z
    .strictObject({
      column: fieldKey,
      is: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  // A system cell the app works out in every row, the form as it is typed
  // and the server as it is submitted: the row's `times` column, a
  // percentage, of the tool's `by` field, an amount, such as D3.1's Amount
  // Due as the row's percentage of the Total Project Value; or the row's
  // `times` column, a number, times its `by` column, such as D3.4's Total
  // Amount as the quantity times the unit price.
  computed: z.strictObject({ times: fieldKey, by: fieldKey }).optional(),
  // Hint text in the empty cell of each fixed row, in order, such as the
  // sheet's "Governs technical scope", or of each row a table with no fixed
  // rows starts with. An empty hint shows none. Only shown; never stored.
  placeholders: z.array(z.string()).min(1).optional(),
}

const column = z.discriminatedUnion("type", [
  plain.extend(columnRequired),
  signature.extend(columnRequired),
  select.extend(columnRequired),
  checklist.extend(columnRequired),
  instruction.extend(columnRequired),
  staticList.extend(columnRequired),
  previewColumn.extend(columnRequired),
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
    // A row with nothing written in it is passed by at submit, so only the
    // rows with a value need their required columns; a required table then
    // needs at least one such row, such as D3.4's invoice lines.
    blankRowsIgnored: z.boolean().optional(),
    // A number column whose rows must add up to `value` before the record
    // can be submitted, such as D3.1's percentages to 100, with what to say
    // until they do.
    sumsTo: z
      .strictObject({
        column: fieldKey,
        value: z.number(),
        message: z.string().min(1),
      })
      .optional(),
    // Cells the app sets when a signature is given, in the same step, each
    // by its fixed row's place (0 for the first) and column, such as D2.14's
    // "Has the PM received this notice?" set to Done when the PM signs. The
    // form never changes them, and the table's submit rules pass them by.
    setOnSign: z
      .array(
        z.strictObject({
          row: z.number().int().min(0),
          column: fieldKey,
          is: z.string().min(1),
          signature: fieldKey,
        })
      )
      .optional(),
    // Cells the app sets as the record locks, in the same step, each by its
    // fixed row's place and column, `when` the select `field` holds `is`,
    // such as D3.5's two conversion tasks set to Done when it is approved
    // with Yes. The form never changes them.
    setOnLock: z
      .array(
        z.strictObject({
          row: z.number().int().min(0),
          column: fieldKey,
          is: z.string().min(1),
          when: z
            .strictObject({ field: fieldKey, is: z.string().min(1) })
            .optional(),
        })
      )
      .optional(),
    // A short note under each fixed row's fixed text, by the row's place,
    // with its [bracketed] names filled in, such as D3.5's two amounts
    // beside check 2.1. An empty note shows none. Only shown; never stored.
    fixedRowNotes: z.array(z.string()).min(1).optional(),
    // Fixed rows not needed on a project, each by its place among the fixed
    // rows (0 for the first): when the project's locked record of `tool`
    // holds `is` in `field`, such as D2.13's negotiation notes when the
    // client accepted the draft as it was. Such a row shows Not needed, and
    // the submit rules on the table pass it by.
    notNeeded: z
      .array(
        z.strictObject({
          row: z.number().int().min(0),
          when: z.strictObject({
            tool: z.string().min(1),
            field: fieldKey,
            is: z.string().min(1),
          }),
        })
      )
      .optional(),
    // Rows read from another tool's table each time the record is shown,
    // one per row of the `tool`'s locked `field`, in its order, such as
    // D3.2's schedule from D3.1's. There is no Add row or Remove. Only the
    // columns the person writes are stored, each row by its `keyedBy`
    // column, such as the SN, so a typed cell stays with its row when the
    // source changes. The app fills every other column.
    rowsFrom: z
      .strictObject({
        tool: z.string().min(1),
        field: fieldKey,
        keyedBy: fieldKey,
      })
      .optional(),
    // Read only, as `readOnly`, while the record's select `field` holds
    // `is`, such as D2.11's signature tracker, which signing in the app
    // fills; otherwise the form writes it.
    readOnlyWhen: z
      .strictObject({ field: fieldKey, is: z.string().min(1) })
      .optional(),
    // One of the fixed rows is picked: `column` is a yes/no column that holds
    // true in exactly that row at submit, and each column `needs` names must
    // be answered in the picked row only. The table holds its fixed rows and
    // no others.
    pickOne: z
      .strictObject({
        column: fieldKey,
        needs: z.array(fieldKey).min(1).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const keys = value.columns.map((entry) => entry.key)

    if (value.pickOne) {
      const picked = value.columns.find(
        (entry) => entry.key === value.pickOne!.column
      )

      if (picked?.type !== "boolean" || !isWritten(picked)) {
        context.addIssue({
          code: "custom",
          path: ["pickOne", "column"],
          message: "A row is picked in a yes/no column the form writes",
        })
      }

      if (!value.fixedRows) {
        context.addIssue({
          code: "custom",
          path: ["pickOne"],
          message: "Only one of a table's fixed rows is picked",
        })
      }

      for (const key of value.pickOne.needs ?? []) {
        const needed = value.columns.find((entry) => entry.key === key)

        if (!needed || !isWritten(needed) || needed.required) {
          context.addIssue({
            code: "custom",
            path: ["pickOne", "needs"],
            message: `${key} is not an optional column the form writes`,
          })
        }
      }
    }

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

    if (
      value.sumsTo &&
      !numericTypes.includes(
        value.columns.find((entry) => entry.key === value.sumsTo!.column)
          ?.type ?? ""
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["sumsTo", "column"],
        message: "A table adds up a number column of its own",
      })
    }

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

    value.setOnLock?.forEach((rule, index) => {
      const set = value.columns.find((entry) => entry.key === rule.column)

      if (rule.row >= (value.fixedRows?.length ?? 0)) {
        context.addIssue({
          code: "custom",
          path: ["setOnLock", index, "row"],
          message: "A cell set on lock is in one of the table's fixed rows",
        })
      }

      if (set?.type !== "select" || !set.options.includes(rule.is)) {
        context.addIssue({
          code: "custom",
          path: ["setOnLock", index, "column"],
          message: `${rule.column} is not a select column with the option "${rule.is}"`,
        })
      }
    })

    if (
      value.fixedRowNotes &&
      value.fixedRowNotes.length > (value.fixedRows?.length ?? 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["fixedRowNotes"],
        message: "A table has a note for each fixed row at most",
      })
    }

    value.columns.forEach((entry, index) => {
      const rule = entry.requiredWhen

      if (!rule) {
        return
      }

      const watched = value.columns.find((each) => each.key === rule.column)

      if (watched?.type !== "select" || !watched.options.includes(rule.is)) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "requiredWhen"],
          message: `${rule.column} is not a select column with the option "${rule.is}"`,
        })
      }
    })

    value.notNeeded?.forEach((rule, index) => {
      if (rule.row >= (value.fixedRows?.length ?? 0)) {
        context.addIssue({
          code: "custom",
          path: ["notNeeded", index, "row"],
          message: "A row not needed is one of the table's fixed rows",
        })
      }
    })

    if (value.fixedRows && (value.prefilledRows || value.lockedRows)) {
      context.addIssue({
        code: "custom",
        path: ["fixedRows"],
        message:
          "A table has fixed rows of several columns, or labels, not both",
      })
    }

    // A table with no fixed rows starts from rows the system gives it, so
    // its hints are for those.
    value.columns.forEach((entry, index) => {
      if (
        entry.placeholders &&
        value.fixedRows &&
        entry.placeholders.length > value.fixedRows.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "placeholders"],
          message: "A placeholder is for one of the table's fixed rows",
        })
      }
    })

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

      const times = value.columns.find(
        (each) => each.key === entry.computed?.times
      )?.type

      const by = value.columns.find(
        (each) => each.key === entry.computed?.by
      )?.type

      if (
        entry.computed &&
        (entry.type !== "currency" ||
          !entry.systemFilled ||
          !(
            times === "percentage" ||
            (times === "number" && (by === "currency" || by === "number"))
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "computed"],
          message:
            "A computed column is a system currency column worked out from a percentage column of the table, or a number column times another column",
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

// The types whose fixed cell is a number written as text.
export const numericTypes = ["number", "currency", "percentage"]

// A fixed cell is a column the form would write, holding text it can hold.
function fixedCellProblem(cell: Column | undefined, text: string) {
  if (!cell) {
    return "Not a column of this table"
  }

  // The row's PDF preview, named by the tool it shows.
  if (cell.type === "pdfPreview") {
    return undefined
  }

  if (!isWritten(cell)) {
    return "A fixed row fixes only a column the form writes"
  }

  if (cell.type === "select") {
    return cell.options.includes(text)
      ? undefined
      : `"${text}" is not one of the options`
  }

  // An amount written as text, such as "0" for a fee that is always nothing.
  if (numericTypes.includes(cell.type)) {
    const value = Number(text)

    if (!Number.isFinite(value) || text.trim() === "") {
      return `"${text}" is not a number`
    }

    return cell.type === "percentage" && (value < 0 || value > 100)
      ? `"${text}" is not a percentage from 0 to 100`
      : undefined
  }

  return cell.type === "text" || cell.type === "longText"
    ? undefined
    : "A fixed row fixes only text, a number or a select"
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

// Filled in by the system as the record locks, in the same step: the name of
// the person who submitted it, the day it locked (YYYY-MM-DD), or the time it
// locked in Ghana time (HH:MM). The field is system-filled, so the form never
// writes it.
const filledOnLock = z.enum(["submittedBy", "lockedAt", "lockedTime"])

const filledOnLockType = {
  submittedBy: "text",
  lockedAt: "date",
  lockedTime: "time",
} as const

export type FilledOnLock = z.output<typeof filledOnLock>

// A system-filled text that says what another field's answer means, such as
// D2.3's Next Step Directive from its status: `field` is a select of the
// tool, and `values` gives the text for each of its options that has one.
// Shown as the answer changes, never stored.
const shownFrom = z.strictObject({
  field: fieldKey,
  values: z.record(z.string().min(1), z.string().min(1)),
})

export type ShownFrom = z.output<typeof shownFrom>

const field = z
  .discriminatedUnion("type", [
    plain.extend({
      ...required,
      filledOnLock: filledOnLock.optional(),
      shownFrom: shownFrom.optional(),
      // Hint text in the empty field, such as the sheet's example answer.
      // Only shown; never stored.
      placeholder: z.string().min(1).optional(),
      // A file field that takes only a PDF, such as D2.11's final contract.
      pdfOnly: z.boolean().optional(),
      // A file field that takes an uploaded PDF or image, such as D3.3's
      // proof of completion: a signed approval or a CAD sign-off.
      pdfOrImage: z.boolean().optional(),
      // A date that follows another date `field` as it is typed, plus the
      // days a duration field such as "40 Working Days" holds
      // (`plusDurationOf`), until the person types a date of their own, such
      // as D2.14's start date following the day the payment cleared. Worked
      // out in the form; what is saved is what the field shows.
      // An amount follows the same way: `percentOf` another field's rate,
      // in percent, of the amount `field` holds, such as D3.4's VAT at
      // D3.1's tax rate of the subtotal, until the person types their own.
      follows: z
        .strictObject({
          field: fieldKey,
          plusDurationOf: fieldKey.optional(),
          percentOf: fieldKey.optional(),
        })
        .optional(),
      // A system-filled text given the next number of a running sequence
      // (lib/sequences) when the record is first saved, and kept on it for
      // good, such as D3.4's invoice number. Never reused.
      issuedFrom: z.string().min(1).optional(),
    }),
    signature.extend(required),
    select.extend({
      ...required,
      blockedWhile: blockedWhile.optional(),
      // The options are the rows of another tool's table, read from the
      // project's locked record of `tool` each time the record is shown,
      // instead of `options`, which stays empty. Each row is named by its
      // numbered SN and its `column`, such as "2.2 Fabrication Milestone
      // (Design Approval)". A row another record of this tool on the project
      // already holds, or one of the first `takenBefore` rows, is shown but
      // cannot be picked, such as D3.3's milestones already billed.
      options: z.array(z.string().min(1)),
      optionsFrom: z
        .strictObject({
          tool: z.string().min(1),
          field: fieldKey,
          column: fieldKey,
          takenBefore: z.number().int().min(0).optional(),
        })
        .optional(),
    }),
    checklist.extend(required),
    instruction.extend(required),
    staticList.extend(required),
    pdfPreview.extend(required),
    table,
  ])
  .refine(holdsSystemOptions, { message: strangerSystemOption })
  .refine(
    (value) =>
      value.type !== "select" ||
      (value.optionsFrom
        ? value.options.length === 0
        : value.options.length > 0),
    {
      message:
        "A select has its own options, or takes them from another tool's table, not both",
    }
  )
  .refine((value) => !(value.inherited && value.required), {
    message:
      "An inherited field is filled in by the system, so it is never required",
  })
  .refine((value) => !(value.required && unwritten.includes(value.type)), {
    message:
      "A signature, instruction, static list or PDF preview is never written in the form, so it is never required",
  })
  .refine((value) => !(value.onlyWhen && value.required), {
    message:
      "A field shown only on some projects is never required: submit asks only for its signature",
  })
  .refine((value) => !(value.systemFilled && value.required), {
    message:
      "A system-filled field is filled in by the system, so it is never required",
  })
  .refine((value) => !value.hidden || value.systemFilled === true, {
    message:
      "Only a system-filled field is hidden: anything else is the person's to fill in",
  })
  .refine(
    (value) =>
      !(value.type === "pdfPreview" && (value.inherited || value.systemFilled)),
    { message: "A PDF preview shows a document, so it holds no value to fill" }
  )
  .refine(
    (value) =>
      !("shownFrom" in value && value.shownFrom) ||
      (value.systemFilled === true && value.type === "text"),
    {
      message:
        "A field shown from another field's answer is system-filled text",
    }
  )
  .refine(
    (value) =>
      !("follows" in value && value.follows) ||
      (value.type === "date" && !value.follows.percentOf) ||
      (value.type === "currency" &&
        value.follows.percentOf !== undefined &&
        !value.follows.plusDurationOf),
    {
      message:
        "A following date may add a duration; a following amount is a percentage (percentOf) of another amount",
    }
  )
  .refine(
    (value) =>
      !("issuedFrom" in value && value.issuedFrom) ||
      (value.systemFilled === true &&
        value.type === "text" &&
        isSequenceName(value.issuedFrom)),
    {
      message:
        "A field issued from a sequence is system-filled text, and names a sequence of lib/sequences",
    }
  )
  .refine(
    (value) =>
      !("filledOnLock" in value && value.filledOnLock) ||
      (value.systemFilled === true &&
        value.type === filledOnLockType[value.filledOnLock]),
    {
      message:
        "A field filled on lock is system-filled: text for who submitted, a date for when it locked, or its time",
    }
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
// The answer a submit rule applies under: the select `field` holding `is`.
const submitWhenAnswer = z.strictObject({
  field: fieldKey,
  is: z.string().min(1),
})

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
    // A living record, such as D3.2's payment ledger: it has no Submit,
    // never locks, and its writers keep it up to date for the life of the
    // project. Its readers see it before anyone saves it, and no tool may
    // wait for it.
    living: z.boolean().optional(),
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
    // Fields that must hold a value before the record can be submitted, each
    // with what to say until then, such as an invite sent or a signature
    // given; `unless` a select holds an option, such as D2.12's audit
    // certificate, which a contract signed on paper has none of.
    submitNeeds: z
      .array(
        z.strictObject({
          field: fieldKey,
          message: z.string().min(1),
          unless: z
            .strictObject({ field: fieldKey, is: z.string().min(1) })
            .optional(),
        })
      )
      .optional(),
    // Select fields that must hold one option before the record can be
    // submitted, or, with `when`, only while another select holds an
    // option, such as every check Pass before D3.5 answers Yes (the refusal
    // then shows on that select), each with what to say until then, such as "Yes" to Ready
    // for PM Review, or, with `isNot`, an answer other than that option,
    // such as a reply that is no longer Pending. With `column`, `field` is a
    // table and every one of its rows must hold the option in that select
    // column, such as each task Done.
    submitWhen: z
      .array(
        z.union([
          z.strictObject({
            field: fieldKey,
            column: fieldKey.optional(),
            is: z.string().min(1),
            // With `column`, a table with no rows passes too, such as a
            // list of amendments that a contract nobody negotiated lacks.
            orNoRows: z.literal(true).optional(),
            when: submitWhenAnswer.optional(),
            message: z.string().min(1),
          }),
          z.strictObject({
            field: fieldKey,
            isNot: z.string().min(1),
            message: z.string().min(1),
          }),
          // At least one row of the table holds the option in that select
          // column, such as a check marked Fail before D3.5 answers No.
          z.strictObject({
            field: fieldKey,
            column: fieldKey,
            some: z.string().min(1),
            when: submitWhenAnswer.optional(),
            message: z.string().min(1),
          }),
          // The select may hold the option only while a number the record
          // works out on submit `equals` a value, or is `otherThan` it, such
          // as D3.7's "amount matches" Yes only with a variance of 0.00.
          z.strictObject({
            field: fieldKey,
            is: z.string().min(1),
            matches: z.union([
              z.strictObject({ field: fieldKey, equals: z.number() }),
              z.strictObject({ field: fieldKey, otherThan: z.number() }),
            ]),
            message: z.string().min(1),
          }),
        ])
      )
      .optional(),
    // Once the system fills `field`, such as the day an email went out, the
    // `fields` named here keep what they held: what was sent cannot change.
    freezesOnceSet: z
      .strictObject({
        field: fieldKey,
        fields: z.array(fieldKey).min(1),
      })
      .optional(),
    // Submitting while the select `field` holds `is` locks the record, then
    // reopens it straight away as the next iteration, empty but for the
    // read-only table `keepsIn`, which gains the locked entry as its first
    // row: each of its columns is the field of the same key. Any other
    // answer leaves it locked. Such as D3.7's daily checks, kept until the
    // FO picks Proceed instead of Continue waiting.
    repeatsWhile: z
      .strictObject({
        field: fieldKey,
        is: z.string().min(1),
        keepsIn: fieldKey,
      })
      .optional(),
    // Once locked the record can never change: no change request can be
    // raised on it, such as a baseline that negotiation holds to.
    noChangeRequests: z.boolean().optional(),
    // Signature fields signed one after another, in `order`, and the last
    // one locks the record. With `approves`, they are signed once the record
    // is submitted, and signing `approves` is the approval, so the tool has
    // no Approve button. With `from`, they are signed while the record is
    // still a draft, once the system fills that field, such as D2.11's
    // contract once it is sent; nobody approves it.
    signInTurn: z
      .union([
        z.strictObject({
          order: z.array(fieldKey).min(1),
          approves: fieldKey,
        }),
        z.strictObject({
          order: z.array(fieldKey).min(1),
          from: fieldKey,
        }),
      ])
      .optional(),
    // The only roles that save the form, such as the CA on D2.11. Anyone
    // else the matrix lets write it may only sign the signatures they are
    // named on.
    writers: z.array(z.enum(roles)).min(1).optional(),
    // A review that can send earlier work back: locking the record while the
    // select `field` holds `is` reopens the project's record of each of
    // `tools` (on a Tier 3 project, the tool that takes its place) as a new
    // iteration, for whoever wrote it. When that record is locked again, this
    // tool reopens as a new iteration too, so it is reviewed again. The
    // people holding the `notifies` roles on the project are told too, in
    // the app and by email, such as the HE and PM when D2.9 deadlocks.
    sendsBackTo: z
      .strictObject({
        field: fieldKey,
        is: z.string().min(1),
        tools: z.array(z.string().min(1)).min(1),
        notifies: z.array(z.enum(roles)).min(1).optional(),
        // A table column whose filled cells say why, added to the reason
        // the writer reads, each after its row's number, such as D3.5's
        // Finance Head Comments.
        explainedBy: z
          .strictObject({ field: fieldKey, column: fieldKey })
          .optional(),
      })
      .optional(),
    // The approver's decision, written on the record in the same step:
    // approving sets the select `field` to `approve`, sending back to
    // `sendBack`, and `by` to the approver's name and `receivedOn` to the day
    // the record was submitted, such as D3.3's Action Taken, Finance Officer
    // and Date Trigger Received. Submitting again clears the decision. Each
    // is a field the system fills.
    decision: z
      .strictObject({
        field: fieldKey,
        approve: z.string().min(1),
        sendBack: z.string().min(1),
        by: fieldKey.optional(),
        receivedOn: fieldKey.optional(),
      })
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
  .refine(
    (value) =>
      !value.living ||
      (value.withoutSubmit &&
        !value.locksOnSubmit &&
        !value.decision &&
        !value.signInTurn &&
        !value.repeatsWhile),
    {
      message:
        "A living record has no Submit, no approval and no signing that locks it",
    }
  )
  .superRefine((value, context) => {
    for (const problem of signInTurnProblems(value)) {
      context.addIssue({
        code: "custom",
        path: ["signInTurn"],
        message: problem,
      })
    }

    for (const problem of answerConditionProblems(value.fields)) {
      context.addIssue({ code: "custom", path: ["fields"], message: problem })
    }

    value.fields.forEach((field, fieldIndex) => {
      if (field.type !== "table") {
        return
      }

      field.setOnLock?.forEach((rule, ruleIndex) => {
        const when = rule.when

        if (!when) {
          return
        }

        const select = value.fields.find((entry) => entry.key === when.field)

        if (!(select?.type === "select" && select.options.includes(when.is))) {
          context.addIssue({
            code: "custom",
            path: ["fields", fieldIndex, "setOnLock", ruleIndex, "when"],
            message: `${when.field} is not a select with the option "${when.is}"`,
          })
        }
      })
    })

    value.submitNeeds?.forEach((need, index) => {
      const unless = need.unless

      const select = unless
        ? value.fields.find((entry) => entry.key === unless.field)
        : undefined

      if (
        unless &&
        !(select?.type === "select" && select.options.includes(unless.is))
      ) {
        context.addIssue({
          code: "custom",
          path: ["submitNeeds", index, "unless"],
          message: `${unless.field} is not a select with the option "${unless.is}"`,
        })
      }
    })

    for (const problem of fillProblems(value.fields, value.fills ?? {})) {
      context.addIssue({ code: "custom", path: ["fills"], message: problem })
    }

    const back = value.sendsBackTo

    if (back) {
      const named = value.fields.find((entry) => entry.key === back.field)

      if (named?.type !== "select" || !named.options.includes(back.is)) {
        context.addIssue({
          code: "custom",
          path: ["sendsBackTo"],
          message: `${back.field} is not a select with the option "${back.is}"`,
        })
      }

      const explained = back.explainedBy

      if (explained) {
        const table = value.fields.find(
          (entry) => entry.key === explained.field
        )

        if (
          table?.type !== "table" ||
          !table.columns.some((entry) => entry.key === explained.column)
        ) {
          context.addIssue({
            code: "custom",
            path: ["sendsBackTo", "explainedBy"],
            message: `${explained.field} is not a table with a column ${explained.column}`,
          })
        }
      }

      if (back.tools.includes(value.id)) {
        context.addIssue({
          code: "custom",
          path: ["sendsBackTo", "tools"],
          message: "A tool cannot send itself back",
        })
      }
    }

    value.fields.forEach((entry, index) => {
      const from = "shownFrom" in entry ? entry.shownFrom : undefined

      if (!from) {
        return
      }

      const source = value.fields.find((each) => each.key === from.field)

      const strays =
        source?.type === "select"
          ? Object.keys(from.values).filter(
              (option) => !source.options.includes(option)
            )
          : []

      if (source?.type !== "select" || strays.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "shownFrom"],
          message:
            source?.type === "select"
              ? `${strays.map((option) => `"${option}"`).join(", ")} is not one of ${from.field}'s options`
              : `${from.field} is not a select of this tool`,
        })
      }
    })

    value.submitWhen?.forEach((rule, index) => {
      const named = value.fields.find((entry) => entry.key === rule.field)

      if ("when" in rule && rule.when) {
        const { when } = rule
        const answer = value.fields.find((entry) => entry.key === when.field)

        if (answer?.type !== "select" || !answer.options.includes(when.is)) {
          context.addIssue({
            code: "custom",
            path: ["submitWhen", index, "when"],
            message: `${when.field} is not a select with the option "${when.is}"`,
          })
        }
      }

      if ("some" in rule) {
        const column =
          named?.type === "table"
            ? named.columns.find((entry) => entry.key === rule.column)
            : undefined

        if (column?.type !== "select" || !column.options.includes(rule.some)) {
          context.addIssue({
            code: "custom",
            path: ["submitWhen", index],
            message: `${rule.field} is not a table with a select column ${rule.column} holding "${rule.some}"`,
          })
        }

        return
      }

      if ("matches" in rule) {
        const number = value.fields.find(
          (entry) => entry.key === rule.matches.field
        )

        if (!number || !numericTypes.includes(number.type)) {
          context.addIssue({
            code: "custom",
            path: ["submitWhen", index, "matches"],
            message: `${rule.matches.field} is not a number field of this tool`,
          })
        }
      }

      if ("isNot" in rule) {
        if (named?.type !== "select" || !named.options.includes(rule.isNot)) {
          context.addIssue({
            code: "custom",
            path: ["submitWhen", index],
            message: `${rule.field} is not a select with the option "${rule.isNot}"`,
          })
        }

        return
      }

      const column = "column" in rule ? rule.column : undefined

      const select = column
        ? named?.type === "table"
          ? named.columns.find((entry) => entry.key === column)
          : undefined
        : named

      if (select?.type !== "select" || !select.options.includes(rule.is)) {
        context.addIssue({
          code: "custom",
          path: ["submitWhen", index],
          message: column
            ? `${rule.field} is not a table with a select column ${column} holding "${rule.is}"`
            : `${rule.field} is not a select with the option "${rule.is}"`,
        })
      }
    })

    const decision = value.decision

    if (decision) {
      const select = value.fields.find((entry) => entry.key === decision.field)

      if (
        select?.type !== "select" ||
        !select.systemFilled ||
        !select.options.includes(decision.approve) ||
        !select.options.includes(decision.sendBack)
      ) {
        context.addIssue({
          code: "custom",
          path: ["decision", "field"],
          message: `${decision.field} is not a system-filled select with the options "${decision.approve}" and "${decision.sendBack}"`,
        })
      }

      for (const [key, type] of [
        [decision.by, "text"],
        [decision.receivedOn, "date"],
      ] as const) {
        const named = value.fields.find((entry) => entry.key === key)

        if (key && !(named?.type === type && named.systemFilled)) {
          context.addIssue({
            code: "custom",
            path: ["decision"],
            message: `${key} is not a system-filled ${type} field of this tool`,
          })
        }
      }
    }

    const repeat = value.repeatsWhile

    if (repeat) {
      for (const problem of repeatProblems(value, repeat)) {
        context.addIssue({
          code: "custom",
          path: ["repeatsWhile"],
          message: problem,
        })
      }
    }

    const freeze = value.freezesOnceSet

    if (freeze) {
      const trigger = value.fields.find((entry) => entry.key === freeze.field)

      if (!trigger?.systemFilled) {
        context.addIssue({
          code: "custom",
          path: ["freezesOnceSet", "field"],
          message: `${freeze.field} is not a system-filled field of this tool`,
        })
      }

      for (const key of freeze.fields) {
        if (!value.fields.some((entry) => entry.key === key)) {
          context.addIssue({
            code: "custom",
            path: ["freezesOnceSet", "fields"],
            message: `${key} is not a field of this tool`,
          })
        }
      }
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

// A tool that repeats locks on submit, on an option of one of its selects,
// and keeps each entry in a read-only table whose columns are its fields.
function repeatProblems(
  value: { locksOnSubmit?: boolean; fields: FieldOutput[] },
  repeat: { field: string; is: string; keepsIn: string }
): string[] {
  const select = value.fields.find((entry) => entry.key === repeat.field)
  const table = value.fields.find((entry) => entry.key === repeat.keepsIn)

  return [
    ...(value.locksOnSubmit
      ? []
      : ["A tool that repeats locks on submit, so each entry is kept"]),
    ...(select?.type === "select" && select.options.includes(repeat.is)
      ? []
      : [`${repeat.field} is not a select with the option "${repeat.is}"`]),
    ...(table?.type === "table" && table.readOnly
      ? table.columns.flatMap((column) =>
          value.fields.some(
            (entry) => entry.key === column.key && entry.type !== "table"
          )
            ? []
            : [
                `${repeat.keepsIn}'s column ${column.key} is not a field of this tool`,
              ]
        )
      : [`${repeat.keepsIn} is not a read-only table of this tool`]),
  ]
}

type Fills = Record<string, "system" | { field: string }>

// Each signature signed in turn is a signature field of the tool, named once,
// and the approving one is among them. Signing in turn after a submit needs
// a submit and an approval, so the tool has both. Signing from a field
// needs that field to be one the system fills.
function signInTurnProblems(value: {
  fields: FieldOutput[]
  signInTurn?:
    { order: string[]; approves: string } | { order: string[]; from: string }
  locksOnSubmit?: boolean
  withoutSubmit?: boolean
}) {
  const turns = value.signInTurn

  if (!turns) {
    return []
  }

  const strays = turns.order.flatMap((key) =>
    value.fields.some(
      (entry) => entry.key === key && entry.type === "signature"
    )
      ? []
      : [`${key} is not a signature field`]
  )

  const once =
    new Set(turns.order).size === turns.order.length
      ? []
      : ["A signature is signed in turn once"]

  if ("from" in turns) {
    const from = value.fields.find((entry) => entry.key === turns.from)

    // The last signature locks the record, so a field filled only on lock
    // could never open signing.
    const lockFilled =
      from !== undefined && "filledOnLock" in from && from.filledOnLock

    return [
      ...strays,
      ...once,
      ...(from?.systemFilled && !lockFilled
        ? []
        : [
            `${turns.from} is not a field the system fills while the record is a draft`,
          ]),
    ]
  }

  return [
    ...strays,
    ...once,
    ...(turns.order.includes(turns.approves)
      ? []
      : [`${turns.approves} is not one of the signatures signed in turn`]),
    ...(value.locksOnSubmit || value.withoutSubmit
      ? ["A tool signed in turn is submitted, then approved by a signature"]
      : []),
  ]
}

// A field shown, or a table read only, while one of the record's answers
// holds names a select field and one of its options, and a signature's
// first view is kept in a field the system fills.
function answerConditionProblems(fields: FieldOutput[]) {
  const answers = (field: string, is: string, owner: string) => {
    const select = fields.find((entry) => entry.key === field)

    return select?.type === "select" && select.options.includes(is)
      ? []
      : [
          `${owner} waits for ${field} to be "${is}", which is not one of its select's options`,
        ]
  }

  return fields.flatMap((entry) => [
    ...(entry.onlyWhen && "field" in entry.onlyWhen
      ? answers(entry.onlyWhen.field, entry.onlyWhen.is, entry.key)
      : []),
    ...(entry.type === "table" && entry.readOnlyWhen
      ? answers(entry.readOnlyWhen.field, entry.readOnlyWhen.is, entry.key)
      : []),
    ...(entry.type === "signature" &&
    entry.viewedAs &&
    !fields.some(
      (each) => each.key === entry.viewedAs && each.systemFilled === true
    )
      ? [
          `${entry.key} keeps its first view in ${entry.viewedAs}, which is not a field the system fills`,
        ]
      : []),
  ])
}

// Every `[Name]` in fixed text, a table's fixed rows or a field's label, such
// as D3.6's "(Day 1 of [N])", must say where it is filled in from, and a fill
// from a field must name a field of the tool that holds one value.
function fillProblems(fields: FieldOutput[], fills: Fills) {
  const named = fields.flatMap((entry) => [
    ...placeholdersIn(entry.label),
    ...(entry.type === "table"
      ? [
          ...(entry.fixedRows ?? []).flatMap((row) =>
            Object.values(row).flatMap(placeholdersIn)
          ),
          ...(entry.fixedRowNotes ?? []).flatMap(placeholdersIn),
        ]
      : []),
  ])

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
