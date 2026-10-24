"use client"

import { LockSimpleIcon, PlusIcon } from "@phosphor-icons/react"
import type { CSSProperties } from "react"

import {
  FieldControl,
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
  "grid-cols-2 gap-3 @2xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))_auto] @2xl:gap-0"

// A table is one set of inputs. Wide, it is a grid with shared borders. Narrow,
// each row becomes a card, so nothing scrolls sideways.
export function TableEditor({ field, rows, onChange, errors }: Props) {
  const columns = field.columns
  const fixed = field.prefilledRows !== undefined

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

  return (
    <div className="@container w-full">
      <div
        role="table"
        aria-label={field.label}
        style={vars({ "--cols": columns.length })}
        className="flex flex-col gap-3 @2xl:gap-0 @2xl:border @2xl:border-foreground/20"
      >
        <div
          role="row"
          className={`hidden bg-muted/60 text-sm font-medium @2xl:grid ${rowGrid}`}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className="border-r border-foreground/20 px-3 py-2"
            >
              {column.label}
            </div>
          ))}
          <div role="columnheader" className="w-24 px-3 py-2" />
        </div>
        {rows.length === 0 && (
          <div role="row">
            <div
              role="cell"
              className="px-3 py-4 text-sm text-muted-foreground"
            >
              No rows yet.
            </div>
          </div>
        )}
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            role="row"
            className={`grid border border-foreground/20 p-3 @2xl:border-0 @2xl:border-t @2xl:p-0 ${rowGrid}`}
          >
            {columns.map((column, columnIndex) => {
              const id = `${field.key}-${rowIndex}-${column.key}`
              const message = cellError(rowIndex, column.key)
              const locked = fixed && columnIndex === 0
              const label = field.prefilledRows?.[rowIndex] ?? ""
              const readOnly = readOnlyTypes.includes(column.type)

              if (locked) {
                return (
                  <div
                    key={column.key}
                    role="cell"
                    className="col-span-2 flex items-center gap-2 bg-muted/60 text-sm font-medium @2xl:col-span-1 @2xl:border-r @2xl:border-foreground/20 @2xl:px-3 @2xl:py-3"
                  >
                    <LockSimpleIcon aria-hidden className="size-4 shrink-0" />
                    {label}
                  </div>
                )
              }

              return (
                <div
                  key={column.key}
                  role="cell"
                  className={`flex flex-col gap-1 @2xl:justify-center @2xl:border-r @2xl:border-foreground/20 ${wideTypes.includes(column.type) ? "col-span-2 @2xl:col-span-1" : ""}`}
                >
                  <label
                    htmlFor={id}
                    className="pt-2 text-xs text-muted-foreground @2xl:sr-only @2xl:pt-0"
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
                      inputClassName="@2xl:h-11 @2xl:border-0 @2xl:shadow-none @2xl:focus-visible:ring-inset @2xl:aria-invalid:ring-inset"
                    />
                  )}
                  {message && (
                    <p
                      id={`${id}-error`}
                      className="px-0 pb-1 text-sm text-destructive @2xl:px-3"
                    >
                      {message}
                    </p>
                  )}
                </div>
              )
            })}
            <div className="col-span-2 flex items-center justify-end @2xl:col-span-1 @2xl:w-24 @2xl:justify-center">
              {!fixed && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove row ${rowIndex + 1}`}
                  onClick={() =>
                    onChange(rows.filter((_, index) => index !== rowIndex))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
        {total && (
          <Subtotal
            columns={columns}
            column={total.column}
            amount={total.amount}
          />
        )}
        {!fixed && (
          <div role="row">
            <div
              role="cell"
              className="@2xl:border-t @2xl:border-foreground/20 @2xl:p-2"
            >
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
      className={`grid border border-foreground/20 bg-muted/60 text-sm font-medium @2xl:border-0 @2xl:border-t ${rowGrid}`}
    >
      <div role="cell" className="px-3 py-3 @2xl:col-start-1">
        Subtotal
      </div>
      <div
        role="cell"
        className="px-3 py-3 text-right tabular-nums @2xl:col-start-[var(--at)] @2xl:row-start-1 @2xl:text-left"
      >
        {money.format(amount)}
      </div>
    </div>
  )
}
