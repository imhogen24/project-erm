"use client"

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
import { TableEditor } from "@/components/table-editor"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
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

  const rows = (labels ?? saved.map(() => undefined)).map((label, index) => {
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
    } else if (field.inherited) {
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

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(held())
      }}
    >
      <FieldGroup className="gap-6">
        {tool.fields.map((field) => {
          const message = messages.get(field.key)

          const errorId = `${field.key}-error`

          // A true/false field reads best as a box with its label beside it.
          const isBox = field.type === "boolean" && !field.inherited

          // These are drawn as a group under a title, not as one input.
          const isGroup =
            field.type === "table" ||
            field.type === "checklist" ||
            readOnlyTypes.includes(field.type)

          const title = (
            <>
              {field.label}
              {field.required && <span aria-hidden> *</span>}
            </>
          )

          const label = (
            <FieldLabel htmlFor={field.key} className="text-sm">
              {title}
            </FieldLabel>
          )

          return (
            <Controller
              key={field.key}
              name={field.key}
              control={form.control}
              render={({ field: control }) => (
                <Field data-invalid={Boolean(message)}>
                  {isGroup ? (
                    <FieldSet className="gap-2">
                      <FieldLegend
                        variant="label"
                        className="mb-0 data-[variant=label]:text-sm"
                      >
                        {title}
                      </FieldLegend>
                      {field.type === "table" ? (
                        <TableEditor
                          field={field}
                          rows={
                            Array.isArray(control.value) ? control.value : []
                          }
                          onChange={control.onChange}
                          errors={errors.filter(
                            (error) =>
                              error.field === field.key &&
                              error.row !== undefined &&
                              error.column !== undefined
                          )}
                        />
                      ) : (
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
                          invalid={Boolean(message)}
                          describedBy={message ? errorId : undefined}
                        />
                      )}
                    </FieldSet>
                  ) : isBox ? (
                    <div className="flex items-center gap-3">
                      <FieldControl
                        cell={field}
                        id={field.key}
                        value={
                          Array.isArray(control.value)
                            ? undefined
                            : control.value
                        }
                        onChange={control.onChange}
                        required={field.required}
                        invalid={Boolean(message)}
                        describedBy={message ? errorId : undefined}
                      />
                      {label}
                    </div>
                  ) : (
                    <>
                      {label}
                      <FieldControl
                        cell={field}
                        id={field.key}
                        value={
                          Array.isArray(control.value)
                            ? undefined
                            : control.value
                        }
                        onChange={control.onChange}
                        required={field.required}
                        invalid={Boolean(message)}
                        describedBy={message ? errorId : undefined}
                      />
                    </>
                  )}
                  {message && <FieldError id={errorId}>{message}</FieldError>}
                </Field>
              )}
            />
          )
        })}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12 bg-foreground/10 px-8 text-base hover:bg-foreground/20"
            onClick={() => onSave(held())}
          >
            Save draft
          </Button>
          <Button type="submit" size="lg" className="h-12 px-8 text-base">
            Submit
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
