import type { Column, TableField } from "@/lib/tool-definition"

// What a numbered column shows in a row, such as "2.3" for the third row of
// an SN column numbered from 2. It is never typed or stored.
export function rowNumber(column: Column, rowIndex: number) {
  return column.numbered ? `${column.numbered}.${rowIndex + 1}` : undefined
}

// The value a fixed row fixes in a column, or undefined where the person
// writes the cell.
export function fixedValue(
  field: TableField,
  rowIndex: number,
  columnKey: string
): string | undefined {
  return field.fixedRows?.[rowIndex]?.[columnKey]
}

// What a new row starts with: each select column's starting option.
export function newRow(field: TableField): Record<string, string> {
  return Object.fromEntries(
    field.columns.flatMap((column) =>
      column.startsAs === undefined ? [] : [[column.key, column.startsAs]]
    )
  )
}

// The rows a table always starts with before anything is saved: its fixed
// rows, each with its other columns' starting options.
export function startingFixedRows(field: TableField): Record<string, string>[] {
  return (field.fixedRows ?? []).map((fixed) => ({
    ...newRow(field),
    ...fixed,
  }))
}
