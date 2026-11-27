"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import {
  FieldControl,
  checklistFlags,
  flagsOf,
  textOf,
  type RawCell,
  type RawRow,
  type RawValue,
} from "@/components/field-control"
import { FileCell } from "@/components/file-cell"
import { ActionButton, SheetActions } from "@/components/sheet-actions"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { TableEditor } from "@/components/table-editor"
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { widthsOf } from "@/lib/column-widths"
import { fileIdOf } from "@/lib/file-reference"
import {
  amountFollowersOf,
  followedAmount,
  followedDate,
  followersOf,
  nextFollowed,
} from "@/lib/follow-dates"
import { startingFixedRows } from "@/lib/fixed-rows"
import {
  amountOf,
  computedCells,
  hasComputedColumns,
} from "@/lib/computed-columns"
import { hasLiveValues, liveValues } from "@/lib/live-values"
import { peopleColumnSources, withColumnPeople } from "@/lib/people-columns"
import { fieldFills, fillFields, type Fills } from "@/lib/placeholders"
import { shownFromSources, shownFromValues } from "@/lib/shown-from"
import type {
  CellValue,
  Column,
  Field as ToolField,
  FieldError as ToolFieldError,
  FieldValue,
  FormValues,
  TableField,
  ToolDefinition,
} from "@/lib/tool-definition"

type Props = {
  tool: ToolDefinition
  values: FormValues
  // What the system fills into the [bracketed] names of fixed text. The names
  // filled from the tool's own fields follow what is typed.
  fills?: Fills
  // What the server found wrong. The form only shows it: one message under a
  // field, or under the exact cell of a table.
  errors?: ToolFieldError[]
  onSave: (values: FormValues) => void
  onSubmit: (values: FormValues) => void
  // A record that cannot be edited shows its values, with the fields disabled
  // and no Save or Submit.
  readOnly?: boolean
  // The signature fields this person may sign now, and what Sign does. A
  // signature is never typed, so Sign stays usable on a read-only record.
  signable?: readonly string[]
  // Signing hands over what is on screen too, so it can be saved first.
  onSign?: (key: string, values: FormValues) => void
  // Set while something is being sent, so a button is not pressed twice.
  pending?: boolean
  // The saved record, so a stored file link can be opened through it.
  recordId?: string
  // What the last action said, or how saving is going, and any buttons that
  // belong after Submit, such as Approve. Both sit in the sheet's action row.
  message?: string
  extraActions?: ReactNode
  // Fields shown but not changed in this form, such as the approver's own
  // fields for the writer.
  heldBack?: readonly string[]
  // A tool that a step of its own locks, such as D1.4's Send, has no Submit.
  submits?: boolean
}

// A run of plain fields shares one box of rows. A table, a checklist and the
// blocks that are only shown each get a box of their own.
type Section =
  | { kind: "rows"; fields: ToolField[]; title?: string }
  | { kind: "group"; field: ToolField }

// A question and its answer: the answer gets the room.
const rowWidths = widthsOf(["text", "long"])

// A PDF preview is a row of its box, as one appendix among others. A
// signature in a section is a row of that section, so the section stays one
// box; a signature on its own is a box of its own.
function isGroup(field: ToolField) {
  if (field.type === "signature") {
    return !field.section
  }

  return (
    field.type === "table" ||
    field.type === "checklist" ||
    (readOnlyTypes.includes(field.type) && field.type !== "pdfPreview")
  )
}

// Fields that act on a locked record: a PDF opens and a signature is given.
const actsWhenLocked = ["pdfPreview", "signature"]

function sectionsOf(fields: ToolField[]): Section[] {
  const sections: Section[] = []

  for (const field of fields) {
    const last = sections.at(-1)

    if (isGroup(field)) {
      sections.push({ kind: "group", field })
    } else if (last?.kind === "rows" && last.title === field.section) {
      last.fields.push(field)
    } else {
      sections.push({ kind: "rows", fields: [field], title: field.section })
    }
  }

  return sections
}

const liveText = z.string().optional().catch(undefined)

const liveRow = z.array(z.record(z.string(), z.unknown())).catch([])

// Shown in the form but never written, so they never leave it.
const readOnlyTypes = ["instruction", "staticList", "signature", "pdfPreview"]

const numeric = ["number", "currency", "percentage"]

// These always send what they hold, even when it is empty.
const plainTypes = ["text", "longText", "date", "boolean", "select"]

const savedCell = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.boolean()),
])

const rowsSchema = z.array(z.record(z.string(), savedCell))

function rawCell(
  cell: ToolField | Column,
  value: FieldValue | undefined
): RawCell {
  if (cell.type === "boolean") {
    return value === true
  }

  if (cell.type === "checklist") {
    return checklistFlags(value)
  }

  return value === null || value === undefined ? "" : String(value)
}

// A table with fixed rows always holds exactly those rows, in that order.
function startingRows(
  field: TableField,
  value: FieldValue | undefined
): RawRow[] {
  const saved = rowsSchema.safeParse(value).data ?? []
  const labels = field.prefilledRows
  const locked = field.lockedRows ?? []

  // Fixed rows of several columns come first, with their fixed values over
  // whatever was saved, then the rows the person added. A fixed row not saved
  // yet starts each other column on its starting option, such as Active.
  if (field.fixedRows) {
    const fixed = field.fixedRows
    const starts = startingFixedRows(field)

    return [...fixed, ...saved.slice(fixed.length)].map((_, index) => {
      const row = saved[index] ?? {}

      return Object.fromEntries(
        field.columns
          .filter((column) => !readOnlyTypes.includes(column.type))
          .map((column) => {
            const typed = rawCell(column, row[column.key])
            const start = starts[index]?.[column.key]

            return [
              column.key,
              fixed[index]?.[column.key] ??
                (typed === "" && start !== undefined ? start : typed),
            ]
          })
      )
    })
  }

  // Locked rows come first, then whatever the person added. A table that
  // starts on a row opens with one empty row when nothing is saved.
  const held =
    labels ??
    (saved.length === 0 && field.startsWithRow
      ? [undefined]
      : [...locked, ...saved.slice(locked.length).map(() => undefined)])

  const rows = held.map((label, index) => {
    const row = saved[index] ?? {}

    return Object.fromEntries(
      field.columns
        .filter((column) => !readOnlyTypes.includes(column.type))
        .map((column, position) => [
          column.key,
          label !== undefined && position === 0
            ? label
            : rawCell(column, row[column.key]),
        ])
    )
  })

  return rows
}

function startingValue(field: ToolField, value: FieldValue | undefined) {
  if (field.type === "table") {
    return startingRows(field, value)
  }

  return rawCell(field, value)
}

// A cell left empty is left out, so a draft can be saved half filled.
function toCell(
  cell: Column | ToolField,
  raw: RawCell | undefined
): CellValue | undefined {
  const text = textOf(raw)

  if (
    readOnlyTypes.includes(cell.type) ||
    cell.inherited ||
    cell.systemFilled ||
    ("numbered" in cell && cell.numbered) ||
    raw === undefined ||
    text === ""
  ) {
    return undefined
  }

  const answers = flagsOf(raw)

  if (answers) {
    return Object.keys(answers).length === 0 ? undefined : answers
  }

  return text !== undefined && numeric.includes(cell.type) ? Number(text) : raw
}

// A table whose rows come from another tool's also sends each row's key,
// such as D3.2's SN, so the server keeps what is typed with its row.
function toRows(field: TableField, rows: RawRow[]) {
  const keyedBy = field.rowsFrom?.keyedBy

  return rows.map((row) =>
    Object.fromEntries(
      field.columns.flatMap((column) => {
        const value =
          column.key === keyedBy
            ? textOf(row[column.key]) || undefined
            : toCell(column, row[column.key])

        return value === undefined ? [] : [[column.key, value]]
      })
    )
  )
}

// The inputs hold text, so a number is turned back into a number here. An empty
// number is null, not zero. The newer types leave out what is empty.
function toValues(
  tool: ToolDefinition,
  held: Record<string, RawValue>
): FormValues {
  const values: FormValues = {}

  for (const field of tool.fields) {
    const raw = held[field.key]

    if (field.type === "table") {
      values[field.key] = toRows(field, Array.isArray(raw) ? raw : [])
    } else if (Array.isArray(raw)) {
      continue
    } else if (field.inherited || field.systemFilled) {
      values[field.key] = textOf(raw) ?? null
    } else if (field.type === "number") {
      const text = textOf(raw)

      values[field.key] =
        text === undefined || text === "" ? null : Number(text)
    } else if (plainTypes.includes(field.type)) {
      values[field.key] = raw ?? ""
    } else {
      const cell = toCell(field, raw)

      if (cell !== undefined) {
        values[field.key] = cell
      }
    }
  }

  return values
}

// The values the system filled, such as D3.1's Total Project Value, which the
// form holds no input for, so its worked-out cells read them as shown.
function systemOf(tool: ToolDefinition, values: FormValues): FormValues {
  return Object.fromEntries(
    tool.fields.flatMap((field) =>
      field.systemFilled && values[field.key] !== undefined
        ? [[field.key, values[field.key]!]]
        : []
    )
  )
}

export function ToolForm({
  tool,
  values,
  fills: systemFills = {},
  errors = [],
  onSave,
  onSubmit,
  readOnly = false,
  signable = [],
  onSign,
  pending = false,
  recordId,
  message: said,
  extraActions,
  submits = true,
  heldBack = [],
}: Props) {
  // Whether the person may not change the field here.
  const shut = (key: string) => readOnly || heldBack.includes(key)

  const form = useForm<Record<string, RawValue>>({
    defaultValues: Object.fromEntries(
      tool.fields
        .filter((field) => !readOnlyTypes.includes(field.type))
        .map((field) => [field.key, startingValue(field, values[field.key])])
    ),
  })

  // Sums the sheet works out as it is typed, such as D1.14's totals or
  // D3.1's Amount Due. Only a tool with sums re-renders on each keystroke.
  useWatch({
    control: form.control,
    disabled: !hasLiveValues(tool.id) && !hasComputedColumns(tool.fields),
  })

  // The answers a field is shown from, such as D2.3's status, so what it
  // says follows them as they change.
  const sources = shownFromSources(tool)

  useWatch({
    control: form.control,
    name: sources,
    disabled: sources.length === 0,
  })

  // The tables a select lists people from, such as D4.3's 2.0 roster for
  // 3.0's engineers, so its options follow them as they are typed.
  const peopleSources = peopleColumnSources(tool.fields)

  useWatch({
    control: form.control,
    name: peopleSources,
    disabled: peopleSources.length === 0,
  })

  const typed = toValues(tool, form.getValues())

  const live = {
    ...liveValues(tool.id, { ...values, ...typed }),
    ...computedCells(tool.fields, {
      ...values,
      ...typed,
      ...systemOf(tool, values),
    }),
    ...shownFromValues(tool, typed),
  }

  // The fields the [bracketed] names are filled from, such as D2.1's [X]%,
  // so the fixed text follows them as they are typed.
  const fillKeys = fillFields(tool.fills)

  const filledFrom = useWatch({
    control: form.control,
    name: fillKeys,
    disabled: fillKeys.length === 0,
  })

  const fills: Fills = {
    ...systemFills,
    ...fieldFills(tool.fills, (key) => filledFrom?.[fillKeys.indexOf(key)]),
  }

  // A message about the whole field. A message about one cell goes to the cell.
  const messages = new Map(
    errors
      .filter((error) => error.row === undefined || error.column === undefined)
      .map((error) => [error.field, error.message])
  )

  function held(): FormValues {
    return toValues(tool, form.getValues())
  }

  // Every sheet saves by itself: each change is handed on, and the saver waits
  // for typing to stop. Saving never needs the form complete, so a
  // half-written draft is kept.
  const save = useRef(onSave)

  useEffect(() => {
    save.current = onSave
  })

  // Dates that follow another as it is typed, such as D2.14's start date
  // following the day the payment cleared, each until the person types a
  // date of their own (nextFollowed). What moves is saved like a change.
  const followers = followersOf(tool.fields)

  // Each date it follows, and the duration added to it.
  const followed = useWatch({
    control: form.control,
    name: followers.flatMap((follower) => [
      follower.field,
      ...(follower.plusDurationOf ? [follower.plusDurationOf] : []),
    ]),
    disabled: followers.length === 0,
  })

  const lastFollowed = useRef<Record<string, string | undefined>>({})
  const followedKey = JSON.stringify(followed ?? [])

  useEffect(() => {
    if (readOnly || followers.length === 0) {
      return
    }

    let moved = false

    // In order, so a date that follows one that just moved follows on.
    for (const follower of followers) {
      const values = form.getValues()
      const read = (key: string) => z.string().catch("").parse(values[key])

      const step = nextFollowed({
        current: read(follower.key),
        next: followedDate(follower, read),
        applied: lastFollowed.current[follower.key],
      })

      if (step.value !== undefined) {
        form.setValue(follower.key, step.value)
        moved = true
      }

      lastFollowed.current[follower.key] = step.applied
    }

    if (moved) {
      save.current(toValues(tool, form.getValues()))
    }
    // The dates move only when what they follow changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey])

  // Amounts that follow another as it changes, such as D3.4's VAT following
  // the subtotal at D3.1's tax rate, each until the person types an amount
  // of their own. The amount followed may be one the sheet works out.
  const amountFollowers = amountFollowersOf(tool.fields)
  const heldNow = form.getValues()

  const amountNow = (key: string) =>
    amountOf(
      z
        .json()
        .catch(null)
        .parse(live[key] ?? heldNow[key] ?? values[key])
    )

  const followedAmounts = amountFollowers.map((follower) =>
    followedAmount(follower, amountNow)
  )

  const lastAmounts = useRef<Record<string, string | undefined>>({})
  const amountsKey = JSON.stringify(followedAmounts)

  useEffect(() => {
    if (readOnly || amountFollowers.length === 0) {
      return
    }

    let moved = false

    amountFollowers.forEach((follower, index) => {
      const step = nextFollowed({
        current: z.string().catch("").parse(form.getValues(follower.key)),
        next: followedAmounts[index],
        applied: lastAmounts.current[follower.key],
      })

      if (step.value !== undefined) {
        form.setValue(follower.key, step.value)
        moved = true
      }

      lastAmounts.current[follower.key] = step.applied
    })

    if (moved) {
      save.current(toValues(tool, form.getValues()))
    }
    // The amounts move only when what they follow changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountsKey])

  useEffect(() => {
    if (readOnly) {
      return
    }

    // Only a change the person makes counts, not the form filling in. Every
    // input, a table's rows and a file among them, changes through its
    // Controller.
    return form.subscribe({
      formState: { values: true },
      callback: ({ type }) => {
        if (type === "change") {
          save.current(toValues(tool, form.getValues()))
        }
      },
    })
  }, [readOnly, form, tool])

  // One field's input, wired to the form, with its error under it.
  function input(field: ToolField, inputClassName?: string) {
    const message = messages.get(field.key)
    const errorId = `${field.key}-error`

    // What the system fills reads as text, not as a box to type in: the
    // value, or a grey note until the system fills it.
    if (field.systemFilled) {
      const shown =
        liveText.parse(live[field.key]) ??
        textOf(rawCell(field, values[field.key])) ??
        ""

      // A step that must come first, such as sending an invite, is reported
      // against the field it fills.
      return (
        <>
          <output
            id={field.key}
            data-empty={shown === ""}
            className="system-value"
          >
            {shown === "" ? (
              (field.systemNote ?? "-")
            ) : field.type === "fileLink" && fileIdOf(shown) ? (
              // A file uploaded in the ERM, such as D2.11's contract once
              // sent, opens through the record and cannot be removed.
              <FileCell
                id={`${field.key}-file`}
                value={shown}
                recordId={recordId}
                readOnly
                onChange={() => undefined}
              />
            ) : field.type === "fileLink" ? (
              // A link the system filled in, such as the copy of an email
              // sent, opens.
              <a
                href={shown}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Open
              </a>
            ) : (
              shown
            )}
          </output>
          {message && <FieldError id={errorId}>{message}</FieldError>}
        </>
      )
    }

    // A true/false field is a box with its label beside it.
    const isBox =
      field.type === "boolean" && !field.inherited && !field.systemFilled

    // A field for an uploaded PDF, such as D2.11's final contract, or a PDF
    // or image, such as D3.3's proof of completion, takes an upload, as a
    // file cell in a table does. Any other link is typed.
    if (field.type === "fileLink" && (field.pdfOnly || field.pdfOrImage)) {
      return (
        <Controller
          name={field.key}
          control={form.control}
          render={({ field: control }) => (
            <Field data-invalid={Boolean(message)}>
              <FileCell
                id={field.key}
                value={z.string().catch("").parse(control.value)}
                recordId={recordId}
                accept={
                  field.pdfOnly ? "application/pdf" : "application/pdf,image/*"
                }
                invalid={Boolean(message)}
                describedBy={message ? errorId : undefined}
                onChange={control.onChange}
              />
              {message && <FieldError id={errorId}>{message}</FieldError>}
            </Field>
          )}
        />
      )
    }

    return (
      <Controller
        name={field.key}
        control={form.control}
        render={({ field: control }) => (
          <Field data-invalid={Boolean(message)}>
            <FieldControl
              cell={field}
              id={field.key}
              value={
                readOnlyTypes.includes(field.type)
                  ? values[field.key]
                  : Array.isArray(control.value)
                    ? undefined
                    : control.value
              }
              onChange={control.onChange}
              inputClassName={inputClassName}
              required={isBox || !isGroup(field) ? field.required : undefined}
              invalid={Boolean(message)}
              describedBy={message ? errorId : undefined}
              placeholder={
                "placeholder" in field ? field.placeholder : undefined
              }
            />
            {message && <FieldError id={errorId}>{message}</FieldError>}
          </Field>
        )}
      />
    )
  }

  // Sign, for a signature this person may give now.
  function signButton(field: ToolField) {
    if (
      field.type !== "signature" ||
      !signable.includes(field.key) ||
      !onSign
    ) {
      return null
    }

    return (
      <ActionButton
        variant="secondary"
        aria-label={`Sign ${field.label}`}
        className="bg-foreground/10 hover:bg-foreground/20"
        disabled={pending}
        onClick={() => onSign(field.key, held())}
      >
        Sign
      </ActionButton>
    )
  }

  function group(field: ToolField) {
    const title = field.required ? `${field.label} *` : field.label
    const message = messages.get(field.key)

    if (field.type === "table") {
      // A PDF preview in a row opens on a locked record too, so such a table
      // disables its own inputs instead.
      const previews = field.columns.some(
        (column) => column.type === "pdfPreview"
      )

      return (
        <TableBox key={field.key} title={title}>
          <fieldset
            disabled={shut(field.key) && !previews}
            data-final={shut(field.key)}
            className="min-w-0 border-0 p-0"
          >
            <Controller
              name={field.key}
              control={form.control}
              render={({ field: control }) => (
                <TableEditor
                  field={withColumnPeople(field, typed)}
                  rows={Array.isArray(control.value) ? control.value : []}
                  // SAFETY: the live sums are numbers and text, which a raw
                  // cell holds.
                  computed={liveRow.parse(live[field.key] ?? []) as RawRow[]}
                  onChange={control.onChange}
                  fills={fills}
                  recordId={recordId}
                  disabled={shut(field.key)}
                  errors={errors.filter(
                    (error) =>
                      error.field === field.key &&
                      error.row !== undefined &&
                      error.column !== undefined
                  )}
                />
              )}
            />
          </fieldset>
          {message && (
            <p className="px-4 pb-3 text-sm text-destructive">{message}</p>
          )}
        </TableBox>
      )
    }

    return (
      <TableBox key={field.key} title={title}>
        <fieldset
          disabled={shut(field.key) && field.type !== "signature"}
          data-final={shut(field.key)}
          className="min-w-0 border-0 p-0"
        >
          <FieldSet className="gap-3 p-4">
            <FieldLegend className="sr-only">{title}</FieldLegend>
            {input(field)}
            {signButton(field)}
          </FieldSet>
        </fieldset>
      </TableBox>
    )
  }

  function rows(fields: ToolField[], first: boolean, title?: string) {
    const heading = title ?? (first ? "Details" : "More details")
    const only = fields.length === 1 ? fields[0] : undefined

    // A box that holds one long text, such as an email, is the text alone,
    // across the whole box.
    if (only?.type === "longText" && title) {
      return (
        <TableBox title={heading}>
          <fieldset
            disabled={shut(only.key)}
            data-final={shut(only.key)}
            className="min-w-0 border-0 p-4"
          >
            <FieldLabel htmlFor={only.key} className="sr-only">
              {only.label}
            </FieldLabel>
            {input(only, "min-h-80")}
          </fieldset>
        </TableBox>
      )
    }

    return (
      <TableBox title={heading}>
        <DataTable
          label={heading}
          columns={["Field", "Answer"]}
          widths={rowWidths}
        >
          {fields.map((field) => (
            <DataRow key={field.key} widths={rowWidths}>
              <DataCell label="">
                <FieldLabel htmlFor={field.key} className="text-sm">
                  {field.label}
                  {field.required && <span aria-hidden> *</span>}
                </FieldLabel>
              </DataCell>
              <DataCell label="">
                {/* A PDF preview opens, and a signature is given, on a
                    locked record too. */}
                <fieldset
                  disabled={
                    shut(field.key) && !actsWhenLocked.includes(field.type)
                  }
                  data-final={shut(field.key)}
                  className="min-w-0 border-0 p-0"
                >
                  {field.type === "signature" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {input(field)}
                      {signButton(field)}
                    </div>
                  ) : (
                    input(field)
                  )}
                </fieldset>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </TableBox>
    )
  }

  const sections = sectionsOf(tool.fields)

  return (
    <form
      noValidate
      className="@container flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(held())
      }}
    >
      {sections.map((section, index) =>
        section.kind === "group" ? (
          group(section.field)
        ) : (
          <div key={section.fields[0].key}>
            {rows(
              section.fields,
              sections.findIndex((each) => each.kind === "rows") === index,
              section.title
            )}
          </div>
        )
      )}
      {((!readOnly && submits) || extraActions || said) && (
        <SheetActions message={said}>
          {!readOnly && submits && (
            <ActionButton type="submit" disabled={pending}>
              {tool.locksOnSubmit ? "Submit" : "Submit for approval"}
            </ActionButton>
          )}
          {extraActions}
        </SheetActions>
      )}
    </form>
  )
}
