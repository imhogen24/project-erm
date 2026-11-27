"use client"

import { LockSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { z } from "zod"

import {
  FieldControl,
  flagsOf,
  textOf,
  type RawCell,
  type RawRow,
} from "@/components/field-control"
import { EmptyState } from "@/components/empty-state"
import { FileCell } from "@/components/file-cell"
import { PdfPreviewField, usePreviews } from "@/components/pdf-preview-field"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { columnWidths } from "@/lib/column-widths"
import { amountOf, countsDays, daysText } from "@/lib/computed-columns"
import { fixedValue, newRow, rowNumber } from "@/lib/fixed-rows"
import { previewCellKey } from "@/lib/pdf-preview"
import { fillText, placeholdersIn, type Fills } from "@/lib/placeholders"
import type {
  Column,
  FieldError as ToolFieldError,
  TableField,
} from "@/lib/tool-definition"

type Props = {
  field: TableField
  rows: RawRow[]
  // The rows with their system cells worked out, such as a row's total.
  computed?: RawRow[]
  onChange: (rows: RawRow[]) => void
  // What the [bracketed] names of fixed text are filled in with.
  fills?: Fills
  // Only the errors that name a row of this table.
  errors: ToolFieldError[]
  // The saved record, so a stored file link can be opened through it.
  recordId?: string
  // The person may not change the table. Its PDF previews still open, so the
  // inputs are disabled here rather than by the box around the table.
  disabled?: boolean
}

const readOnlyTypes = ["instruction", "staticList", "signature"]

// Short inputs share a line on a phone. Long ones take the whole line.
const wideTypes = ["text", "longText", "email", "fileLink", "select"]

function vars(values: Record<string, number | string>): CSSProperties {
  // SAFETY: React hands custom properties such as --table-columns to the DOM untouched;
  // CSSProperties only leaves them out of its list of known names.
  return values as CSSProperties
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// A cell as a number or text an amount is read from: anything else holds none.
const cellAmount = z.union([z.number(), z.string()]).optional().catch(undefined)

// What a column adds up to. A cell the sums show as text, such as a
// row's "15 Days", counts as its number.
function sumOf(rows: RawRow[], key: string) {
  return rows.reduce((total, row) => {
    const amount = amountOf(cellAmount.parse(row[key]))

    return amount === undefined ? total : total + amount
  }, 0)
}

// Wide, each column is as wide as what it holds (--table-columns, from
// columnWidths): a serial number narrow, long text wide.
const rowGrid =
  "grid-cols-2 gap-3 @xl:grid-cols-[var(--table-columns)] @xl:gap-0"

// A table is one set of inputs. Wide, it is a grid with shared borders. Narrow,
// each row becomes a card, so nothing scrolls sideways.
export function TableEditor({
  field,
  rows: typed,
  computed = [],
  onChange,
  fills = {},
  errors,
  recordId,
  disabled = false,
}: Props) {
  const columns = field.columns

  // What a system cell shows comes from the sums; what is typed is kept.
  const rows = typed.map((row, index) => ({
    ...row,
    ...Object.fromEntries(
      columns.flatMap((column) =>
        column.systemFilled && computed[index]?.[column.key] !== undefined
          ? [[column.key, computed[index][column.key]]]
          : []
      )
    ),
  }))

  const fixed = field.prefilledRows !== undefined

  // Rows labelled in the first column, and every row that cannot be removed:
  // those and the fixed rows of several columns.
  const labelledCount = field.lockedRows?.length ?? 0

  const lockedCount = Math.max(labelledCount, field.fixedRows?.length ?? 0)

  // A row the person added can be removed. Its Remove button sits inside the
  // last cell, so the table has no empty column at the right.
  const shownOnly = field.readOnly === true

  // Rows read from another tool's table, such as D3.2's schedule from
  // D3.1's: the person writes their cells, but adds and removes none. With
  // `addRows`, such as D4.7's attendees, rows the person adds follow them:
  // each holds no key, and its system columns are typed.
  const sourced = field.rowsFrom !== undefined
  const addable = field.rowsFrom?.addRows === true
  const keyedBy = field.rowsFrom?.keyedBy

  const isSourcedRow = (rowIndex: number) =>
    sourced &&
    (!addable ||
      (keyedBy !== undefined && Boolean(textOf(typed[rowIndex]?.[keyedBy]))))

  const previews = usePreviews()

  // A row whose document the project does not need, such as D2.13's
  // negotiation notes after the draft was accepted as it was: its choices
  // read Not needed, and submitting passes it by.
  const notNeeded = (rowIndex: number) =>
    field.columns.some(
      (column) =>
        column.type === "pdfPreview" &&
        previews[previewCellKey(field.key, rowIndex, column.key)]?.status ===
          "notNeeded"
    )

  const canRemove = (rowIndex: number) =>
    !fixed &&
    !isSourcedRow(rowIndex) &&
    !shownOnly &&
    !disabled &&
    rowIndex >= lockedCount

  // Some row can be removed: wide, the Remove buttons get a narrow column of
  // their own at the right, so every row's fields line up. A table whose rows
  // all stay has no such column.
  const growable = !field.pickOne && rows.some((_, index) => canRemove(index))

  // A total of working days, such as D4.8's TOTAL PROJECT DURATION, reads
  // in days; any other total is money.
  const total = field.subtotal
    ? {
        column: field.subtotal,
        text: countsDays(
          columns.find((column) => column.key === field.subtotal)
        )
          ? daysText(sumOf(rows, field.subtotal))
          : money.format(sumOf(rows, field.subtotal)),
      }
    : undefined

  // Picking a row lets go of any other; pressing the picked one again lets go
  // of it, leaving nothing picked.
  function pick(rowIndex: number, key: string, picked: boolean) {
    onChange(
      typed.map((row, index) => ({
        ...row,
        [key]: picked && index === rowIndex,
      }))
    )
  }

  function setCell(rowIndex: number, key: string, value: RawCell) {
    onChange(
      typed.map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row
      )
    )
  }

  // What a fixed row is called: the first value it fixes that is not a PDF
  // preview's tool or a [bracketed] fill, such as "Client Legal Entity Name".
  function rowName(rowIndex: number) {
    const named = columns.find((column) => {
      const text = fixedValue(field, rowIndex, column.key)

      return (
        column.type !== "pdfPreview" &&
        text !== undefined &&
        placeholdersIn(text).length === 0
      )
    })

    return named
      ? fixedValue(field, rowIndex, named.key)
      : `row ${rowIndex + 1}`
  }

  function cellError(rowIndex: number, key: string) {
    return errors.find(
      (error) => error.row === rowIndex && error.column === key
    )?.message
  }

  function removeButton(rowIndex: number) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Remove row ${rowIndex + 1}`}
        title="Remove this row"
        disabled={disabled}
        className="tile-action size-12 shrink-0"
        onClick={() => onChange(typed.filter((_, index) => index !== rowIndex))}
      >
        <TrashIcon aria-hidden className="size-5" />
      </Button>
    )
  }

  return (
    <div className="@container w-full">
      <div
        role="table"
        aria-label={field.label}
        style={vars({
          "--table-columns": `${columnWidths(columns, field.fixedRows)}${growable ? " 3.5rem" : ""}`,
        })}
        className="flex flex-col"
      >
        <div
          role="row"
          className={`column-header-row hidden border-b border-foreground/20 @xl:grid ${rowGrid}`}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className="border-r border-foreground/20 px-4 py-2 last:border-r-0"
            >
              {column.label}
            </div>
          ))}
          {growable && (
            <div role="columnheader">
              <span className="sr-only">Remove</span>
            </div>
          )}
        </div>
        {rows.length === 0 && (
          <div role="row">
            <div role="cell" className="px-4 py-4">
              {shownOnly || (sourced && !addable) ? (
                <EmptyState size="inline" title="None" />
              ) : (
                <EmptyState
                  size="inline"
                  title="Nothing here yet"
                  description="Press Add row to start the list."
                />
              )}
            </div>
          </div>
        )}
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            role="row"
            className={`grid p-4 not-last:border-b not-last:border-foreground/20 @xl:p-0 ${rowGrid}`}
          >
            {columns.map((column, columnIndex) => {
              const id = `${field.key}-${rowIndex}-${column.key}`
              const message = cellError(rowIndex, column.key)

              const locked =
                columnIndex === 0 && (fixed || rowIndex < labelledCount)

              const label =
                (field.prefilledRows ?? field.lockedRows)?.[rowIndex] ?? ""

              const readOnly = readOnlyTypes.includes(column.type)

              if (locked) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className="col-span-2 flex items-center gap-2 text-base font-medium @xl:col-span-1 @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0"
                  >
                    {/* A padlock only where fixed rows sit beside rows the
                        person adds; in a fully fixed table every row is. */}
                    {!fixed && (
                      <LockSimpleIcon
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span>{label}</span>
                      {field.rowNotes?.[label] && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {field.rowNotes[label]}
                        </span>
                      )}
                    </span>
                  </div>
                )
              }

              // A fixed row's PDF preview of the tool it names, in a preview
              // column or in place of another column's input (rowPreviews),
              // such as T3.D4.8a's client files. A row the person added has
              // none.
              const rowPreview =
                column.type === "pdfPreview"
                  ? undefined
                  : column.rowPreviews?.[rowIndex] || undefined

              const fixedText =
                rowPreview ?? fixedValue(field, rowIndex, column.key)

              if (column.type === "pdfPreview" || rowPreview) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className="col-span-2 flex flex-col gap-1 @xl:col-span-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-2 @xl:last:border-r-0"
                  >
                    <span className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </span>
                    {fixedText === undefined ? (
                      // A row the person added: no source.
                      <span className="text-base text-muted-foreground">-</span>
                    ) : (
                      // The name at the left and View at the right, so the
                      // buttons of every row line up in one column.
                      <span className="flex items-center justify-between gap-3 text-base">
                        <span className="min-w-0 break-words">
                          {previews[
                            previewCellKey(field.key, rowIndex, column.key)
                          ]?.name ?? fixedText}
                        </span>
                        <PdfPreviewField
                          id={id}
                          field={{
                            key: previewCellKey(
                              field.key,
                              rowIndex,
                              column.key
                            ),
                            label: `${column.label} for ${rowName(rowIndex)}`,
                          }}
                        />
                      </span>
                    )}
                  </div>
                )
              }

              // A cell the app writes: a fixed row's value, with its
              // [bracketed] names filled in, or the row's number.
              const numbered = rowNumber(column, rowIndex)

              if (fixedText !== undefined || numbered !== undefined) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    data-fixed={fixedText !== undefined}
                    className={`flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0 ${wideTypes.includes(column.type) ? "col-span-2 @xl:col-span-1" : ""}`}
                  >
                    <span className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </span>
                    <span className="flex items-start gap-2 text-base break-words">
                      {fixedText !== undefined && (
                        <LockSimpleIcon
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span>
                          {fixedText === undefined
                            ? numbered
                            : fillText(fixedText, fills)}
                        </span>
                        {/* The row's note, under its first fixed cell,
                            such as D3.5's two amounts beside check 2.1. */}
                        {fixedText !== undefined &&
                          field.fixedRowNotes?.[rowIndex] &&
                          Object.keys(field.fixedRows?.[rowIndex] ?? {})[0] ===
                            column.key && (
                            <span className="text-xs text-muted-foreground">
                              {fillText(field.fixedRowNotes[rowIndex], fills)}
                            </span>
                          )}
                      </span>
                    </span>
                  </div>
                )
              }

              // A cell a signature or the lock sets, such as D2.14's "PM
              // received this notice", or the app fills in a row read from
              // another tool, such as D3.2's status, reads as what it holds,
              // wrapping so nothing is cut off.
              const setBySigning = [
                ...(field.setOnSign ?? []),
                ...(field.setOnLock ?? []),
              ].some(
                (rule) => rule.row === rowIndex && rule.column === column.key
              )

              if (
                setBySigning ||
                (isSourcedRow(rowIndex) && column.systemFilled)
              ) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className={`flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0 ${wideTypes.includes(column.type) ? "col-span-2 @xl:col-span-1" : ""}`}
                  >
                    <span className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </span>
                    <span
                      id={id}
                      className="text-base break-words text-foreground"
                    >
                      {String(row[column.key] ?? "")}
                    </span>
                  </div>
                )
              }

              if (column.type === "select" && notNeeded(rowIndex)) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className="flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0"
                  >
                    <span className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </span>
                    <span className="text-base text-muted-foreground">
                      Not needed
                    </span>
                  </div>
                )
              }

              if (shownOnly) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className={`flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0 ${wideTypes.includes(column.type) ? "col-span-2 @xl:col-span-1" : ""}`}
                  >
                    <span className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </span>
                    <ShownCell
                      column={column}
                      value={row[column.key]}
                      recordId={recordId}
                      rowNumber={rowIndex + 1}
                    />
                  </div>
                )
              }

              return (
                <div
                  key={column.key}
                  role="cell"
                  className={`relative flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:p-3 @xl:last:border-r-0 ${wideTypes.includes(column.type) ? "col-span-2 @xl:col-span-1" : ""}`}
                >
                  <label
                    htmlFor={id}
                    className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0"
                  >
                    {column.label}
                    <span className="sr-only">, row {rowIndex + 1}</span>
                  </label>
                  <fieldset
                    disabled={disabled}
                    className="flex min-w-0 items-start gap-2 border-0 p-0"
                  >
                    <div className="min-w-0 flex-1">
                      {column.key === field.pickOne?.column ? (
                        <RadioGroup
                          value={row[column.key] === true ? "picked" : ""}
                          onValueChange={(value) =>
                            pick(rowIndex, column.key, value === "picked")
                          }
                          aria-label={`${column.label}: ${rowName(rowIndex)}`}
                          className="flex h-12 items-center"
                        >
                          <RadioGroupItem
                            id={id}
                            value="picked"
                            aria-label={rowName(rowIndex)}
                            aria-invalid={message !== undefined}
                            aria-describedby={
                              message ? `${id}-error` : undefined
                            }
                          />
                        </RadioGroup>
                      ) : readOnly ? (
                        <FieldControl
                          cell={rowCell(column, rowIndex)}
                          id={id}
                          value={row[column.key]}
                          onChange={() => undefined}
                        />
                      ) : column.type === "fileLink" ? (
                        <FileCell
                          id={id}
                          value={textOf(row[column.key]) ?? ""}
                          recordId={recordId}
                          invalid={message !== undefined}
                          describedBy={message ? `${id}-error` : undefined}
                          onChange={(value) =>
                            setCell(rowIndex, column.key, value)
                          }
                        />
                      ) : (
                        <FieldControl
                          cell={rowCell(column, rowIndex)}
                          id={id}
                          value={row[column.key]}
                          onChange={(value) =>
                            setCell(rowIndex, column.key, value)
                          }
                          invalid={message !== undefined}
                          describedBy={message ? `${id}-error` : undefined}
                          placeholder={
                            column.placeholders?.[rowIndex] ??
                            // A choice in a narrow column asks briefly.
                            (column.type === "select" ? "Choose" : undefined)
                          }
                          // Every field in a row starts one line tall, so a
                          // row reads level; a long answer grows as it is
                          // typed.
                          inputClassName={
                            column.type === "longText"
                              ? "min-h-12 py-[0.6875rem]"
                              : ""
                          }
                        />
                      )}
                    </div>
                  </fieldset>
                  {message && (
                    <p
                      id={`${id}-error`}
                      className="px-0 pb-1 text-sm text-destructive @xl:px-4"
                    >
                      {message}
                    </p>
                  )}
                </div>
              )
            })}
            {growable && (
              <div
                role="cell"
                className="hidden items-center justify-center @xl:flex"
              >
                {canRemove(rowIndex) && removeButton(rowIndex)}
              </div>
            )}
            {canRemove(rowIndex) && (
              <div className="col-span-2 flex justify-end @xl:hidden">
                {removeButton(rowIndex)}
              </div>
            )}
          </div>
        ))}
        {total && (
          <Subtotal
            columns={columns}
            column={total.column}
            text={total.text}
            label={field.subtotalLabel ?? "Subtotal"}
          />
        )}
        {/* A table that picks one of its fixed rows holds no others. */}
        {!fixed &&
          (!sourced || addable) &&
          !shownOnly &&
          !disabled &&
          !field.pickOne && (
            <div role="row">
              <div role="cell" className="p-4 @xl:p-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="tile-action"
                  disabled={disabled}
                  onClick={() => onChange([...typed, newRow(field)])}
                >
                  <PlusIcon aria-hidden />
                  Add row
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

// A column as one row's cell offers it: a select with the options of its
// fixed row (rowOptions), such as T3.D4.8a's Created or Pending.
function rowCell(column: Column, rowIndex: number): Column {
  const options =
    column.type === "select" ? column.rowOptions?.[rowIndex] : undefined

  return options && column.type === "select" ? { ...column, options } : column
}

// What a read-only cell says: a yes or no answer, the checked items of a
// checklist, or the text itself.
function shownText(column: Column, value: RawCell | undefined) {
  const answers = flagsOf(value)

  if (answers) {
    return column.type === "checklist"
      ? column.items.filter((item) => answers[item]).join(", ")
      : ""
  }

  if (value === true) {
    return "Yes"
  }

  return value === false ? "No" : (textOf(value) ?? "")
}

// A value shown as it was saved. A stored file link is an Open file button that
// goes through the ERM, so it only opens for a person who may read the record.
// With no link, or no saved record yet, there is nothing to open.
function ShownCell({
  column,
  value,
  recordId,
  rowNumber,
}: {
  column: Column
  value: RawCell | undefined
  recordId?: string
  rowNumber: number
}) {
  const text = shownText(column, value)

  // A page in the ERM, such as a record to read.
  if (text.startsWith("/projects/")) {
    return (
      <Button asChild variant="outline" size="sm" className="self-start">
        <a href={text}>
          Open<span className="sr-only">, row {rowNumber}</span>
        </a>
      </Button>
    )
  }

  if (column.type !== "fileLink") {
    return <span className="text-base break-words">{text}</span>
  }

  if (!text || !recordId) {
    return null
  }

  return (
    <Button asChild variant="outline" size="sm" className="self-start">
      <a
        href={`/api/files/${recordId}?ref=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open file
        <span className="sr-only">, row {rowNumber}</span>
      </a>
    </Button>
  )
}

function Subtotal({
  columns,
  column,
  text,
  label,
}: {
  columns: Column[]
  column: string
  text: string
  label: string
}) {
  const position = columns.findIndex((entry) => entry.key === column) + 1

  return (
    <div
      role="row"
      style={vars({ "--at": position })}
      className={`grid border-t border-foreground/20 text-base font-medium ${rowGrid}`}
    >
      <div role="cell" className="px-4 py-3 @xl:col-start-1">
        {label}
      </div>
      <div
        role="cell"
        className="px-4 py-3 text-right tabular-nums @xl:col-start-[var(--at)] @xl:row-start-1 @xl:text-left"
      >
        {text}
      </div>
    </div>
  )
}
