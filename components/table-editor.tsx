"use client"

import { LockSimpleIcon, PlusIcon } from "@phosphor-icons/react"
import type { CSSProperties } from "react"

import {
  FieldControl,
  flagsOf,
  textOf,
  type RawCell,
  type RawRow,
} from "@/components/field-control"
import { Button } from "@/components/ui/button"
import type {
  Column,
  FieldError as ToolFieldError,
  TableField,
} from "@/lib/tool-definition"

type Props = {
  field: TableField
  rows: RawRow[]
  onChange: (rows: RawRow[]) => void
  // Only the errors that name a row of this table.
  errors: ToolFieldError[]
  // The saved record, so a stored file link can be opened through it.
  recordId?: string
}

const readOnlyTypes = ["instruction", "staticList", "signature"]

// Short inputs share a line on a phone. Long ones take the whole line.
const wideTypes = ["text", "longText", "email", "fileLink", "select"]

function vars(values: Record<string, number>): CSSProperties {
  // SAFETY: React hands custom properties such as --cols to the DOM untouched;
  // CSSProperties only leaves them out of its list of known names.
  return values as CSSProperties
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function sumOf(rows: RawRow[], key: string) {
  return rows.reduce((total, row) => {
    const amount = Number(row[key])

    return row[key] === undefined || row[key] === "" || Number.isNaN(amount)
      ? total
      : total + amount
  }, 0)
}

const rowGrid =
  "grid-cols-2 gap-3 @xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))] @xl:gap-0"

// A table is one set of inputs. Wide, it is a grid with shared borders. Narrow,
// each row becomes a card, so nothing scrolls sideways.
export function TableEditor({
  field,
  rows,
  onChange,
  errors,
  recordId,
}: Props) {
  const columns = field.columns
  const fixed = field.prefilledRows !== undefined
  const lockedCount = field.lockedRows?.length ?? 0

  // A row the person added can be removed. Its Remove button sits inside the
  // last cell, so the table has no empty column at the right.
  const shownOnly = field.readOnly === true

  const canRemove = (rowIndex: number) =>
    !fixed && !shownOnly && rowIndex >= lockedCount

  const total = field.subtotal
    ? { column: field.subtotal, amount: sumOf(rows, field.subtotal) }
    : undefined

  function setCell(rowIndex: number, key: string, value: RawCell) {
    onChange(
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row
      )
    )
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
        variant="ghost"
        size="sm"
        aria-label={`Remove row ${rowIndex + 1}`}
        onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}
      >
        Remove
      </Button>
    )
  }

  return (
    <div className="@container w-full">
      <div
        role="table"
        aria-label={field.label}
        style={vars({ "--cols": columns.length })}
        className="flex flex-col"
      >
        <div
          role="row"
          className={`hidden border-b border-foreground/20 text-xs text-muted-foreground @xl:grid ${rowGrid}`}
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
        </div>
        {rows.length === 0 && (
          <div role="row">
            <div
              role="cell"
              className="px-4 py-4 text-sm text-muted-foreground"
            >
              No rows yet.
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
                columnIndex === 0 && (fixed || rowIndex < lockedCount)

              const label =
                (field.prefilledRows ?? field.lockedRows)?.[rowIndex] ?? ""

              const readOnly = readOnlyTypes.includes(column.type)

              const removable =
                columnIndex === columns.length - 1 && canRemove(rowIndex)

              if (locked) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className="col-span-2 flex items-center gap-2 bg-muted/60 text-sm font-medium @xl:col-span-1 @xl:border-r @xl:border-foreground/20 @xl:px-4 @xl:py-3 @xl:last:border-r-0"
                  >
                    <LockSimpleIcon aria-hidden className="size-4 shrink-0" />
                    {label}
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
                  className={`relative flex flex-col gap-1 @xl:justify-center @xl:border-r @xl:border-foreground/20 @xl:last:border-r-0 ${wideTypes.includes(column.type) ? "col-span-2 @xl:col-span-1" : ""}`}
                >
                  <label
                    htmlFor={id}
                    className="pt-2 text-xs text-muted-foreground @xl:sr-only @xl:pt-0"
                  >
                    {column.label}
                    <span className="sr-only">, row {rowIndex + 1}</span>
                  </label>
                  {readOnly ? (
                    <FieldControl
                      cell={column}
                      id={id}
                      value={row[column.key]}
                      onChange={() => undefined}
                    />
                  ) : (
                    <FieldControl
                      cell={column}
                      id={id}
                      value={row[column.key]}
                      onChange={(value) => setCell(rowIndex, column.key, value)}
                      invalid={message !== undefined}
                      describedBy={message ? `${id}-error` : undefined}
                      inputClassName={`@xl:h-11 @xl:border-0 @xl:shadow-none @xl:focus-visible:ring-inset @xl:aria-invalid:ring-inset ${removable ? "@xl:pr-24" : ""}`}
                    />
                  )}
                  {removable && (
                    <div className="absolute top-1 right-1 hidden @xl:block">
                      {removeButton(rowIndex)}
                    </div>
                  )}
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
            amount={total.amount}
          />
        )}
        {!fixed && !shownOnly && (
          <div role="row">
            <div role="cell" className="p-4 @xl:p-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="bg-foreground/10 hover:bg-foreground/20"
                onClick={() => onChange([...rows, {}])}
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

  if (column.type !== "fileLink") {
    return <span className="text-sm break-words">{text}</span>
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
  amount,
}: {
  columns: Column[]
  column: string
  amount: number
}) {
  const position = columns.findIndex((entry) => entry.key === column) + 1

  return (
    <div
      role="row"
      style={vars({ "--at": position })}
      className={`grid border-t border-foreground/20 bg-muted/60 text-sm font-medium ${rowGrid}`}
    >
      <div role="cell" className="px-4 py-3 @xl:col-start-1">
        Subtotal
      </div>
      <div
        role="cell"
        className="px-4 py-3 text-right tabular-nums @xl:col-start-[var(--at)] @xl:row-start-1 @xl:text-left"
      >
        {money.format(amount)}
      </div>
    </div>
  )
}
