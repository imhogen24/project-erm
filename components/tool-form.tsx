"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Controller, useForm } from "react-hook-form"
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
  onSign?: (key: string) => void
  // Set while something is being sent, so a button is not pressed twice.
  pending?: boolean
  // The saved record, so a stored file link can be opened through it.
  recordId?: string
  // What the last action said, and any buttons that belong after Save and
  // Submit, such as Approve. Both sit in the sheet's action row.
  message?: string
  extraActions?: ReactNode
  // The tool saves by itself: no Save draft or Submit, and onSave is called a
  // moment after the person stops typing.
  autosave?: boolean
}

// How long after the last keystroke an autosave goes.
const AUTOSAVE_DELAY = 800

// A run of plain fields shares one box of rows. A table, a checklist and the
// blocks that are only shown each get a box of their own.
type Section =
  | { kind: "rows"; fields: ToolField[]; title?: string }
  | { kind: "group"; field: ToolField }

const rowWidths = "minmax(0,16rem) minmax(0,1fr)"

function isGroup(field: ToolField) {
  return (
    field.type === "table" ||
    field.type === "checklist" ||
    readOnlyTypes.includes(field.type)
  )
}

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

// Shown in the form but never written, so they never leave it.
const readOnlyTypes = ["instruction", "staticList", "signature"]

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

function toRows(field: TableField, rows: RawRow[]) {
  return rows.map((row) =>
    Object.fromEntries(
      field.columns.flatMap((column) => {
        const value = toCell(column, row[column.key])

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

export function ToolForm({
  tool,
  values,
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
  autosave = false,
}: Props) {
  const form = useForm<Record<string, RawValue>>({
    defaultValues: Object.fromEntries(
      tool.fields
        .filter((field) => !readOnlyTypes.includes(field.type))
        .map((field) => [field.key, startingValue(field, values[field.key])])
    ),
  })

  // A message about the whole field. A message about one cell goes to the cell.
  const messages = new Map(
    errors
      .filter((error) => error.row === undefined || error.column === undefined)
      .map((error) => [error.field, error.message])
  )

  function held(): FormValues {
    return toValues(tool, form.getValues())
  }

  // Each change restarts the wait, so a save goes only once typing stops.
  // Saving never needs the form complete, so a half-written draft is kept.
  const save = useRef(onSave)

  useEffect(() => {
    save.current = onSave
  })

  useEffect(() => {
    if (!autosave || readOnly) {
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    // Only a change the person makes counts, not the form filling in.
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ type }) => {
        if (type !== "change") {
          return
        }

        clearTimeout(timer)
        timer = setTimeout(
          () => save.current(toValues(tool, form.getValues())),
          AUTOSAVE_DELAY
        )
      },
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [autosave, readOnly, form, tool])

  // One field's input, wired to the form, with its error under it.
  function input(field: ToolField, inputClassName?: string) {
    const message = messages.get(field.key)
    const errorId = `${field.key}-error`

    // What the system fills reads as text, not as a box to type in: the
    // value, or a grey note until the system fills it.
    if (field.systemFilled) {
      const shown = textOf(rawCell(field, values[field.key])) ?? ""

      return (
        <output
          id={field.key}
          data-empty={shown === ""}
          className="system-value"
        >
          {shown === ""
            ? (field.systemNote ?? "Filled in by the system")
            : shown}
        </output>
      )
    }

    // A true/false field is a box with its label beside it.
    const isBox =
      field.type === "boolean" && !field.inherited && !field.systemFilled

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
            />
            {message && <FieldError id={errorId}>{message}</FieldError>}
          </Field>
        )}
      />
    )
  }

  function group(field: ToolField) {
    const title = field.required ? `${field.label} *` : field.label
    const message = messages.get(field.key)

    if (field.type === "table") {
      return (
        <TableBox key={field.key} title={title}>
          <fieldset
            disabled={readOnly}
            data-final={readOnly}
            className="min-w-0 border-0 p-0"
          >
            <Controller
              name={field.key}
              control={form.control}
              render={({ field: control }) => (
                <TableEditor
                  field={field}
                  rows={Array.isArray(control.value) ? control.value : []}
                  onChange={control.onChange}
                  recordId={recordId}
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
          disabled={readOnly && field.type !== "signature"}
          data-final={readOnly}
          className="min-w-0 border-0 p-0"
        >
          <FieldSet className="gap-3 p-4">
            <FieldLegend className="sr-only">{title}</FieldLegend>
            {input(field)}
            {field.type === "signature" &&
              signable.includes(field.key) &&
              onSign && (
                <ActionButton
                  variant="secondary"
                  aria-label={`Sign ${field.label}`}
                  className="bg-foreground/10 hover:bg-foreground/20"
                  disabled={pending}
                  onClick={() => onSign(field.key)}
                >
                  Sign
                </ActionButton>
              )}
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
            disabled={readOnly}
            data-final={readOnly}
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
                <fieldset
                  disabled={readOnly}
                  data-final={readOnly}
                  className="min-w-0 border-0 p-0"
                >
                  {input(field)}
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
      {((!readOnly && !autosave) || extraActions || said) && (
        <SheetActions message={said}>
          {!readOnly && !autosave && (
            <>
              <ActionButton
                variant="secondary"
                className="bg-foreground/10 hover:bg-foreground/20"
                disabled={pending}
                onClick={() => onSave(held())}
              >
                Save draft
              </ActionButton>
              <ActionButton type="submit" disabled={pending}>
                Submit for approval
              </ActionButton>
            </>
          )}
          {extraActions}
        </SheetActions>
      )}
    </form>
  )
}
