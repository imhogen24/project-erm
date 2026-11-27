import type { Column } from "@/lib/tool-definition"

// How wide a table's columns are when there is room: each column takes what
// its content needs. A serial number is narrow, a short answer takes less
// than a share, a choice, date or amount one share, short text one and a
// half, and long text the most. Narrow, the rows stack instead, so these
// never apply on a phone.
// `document` holds a document's name and its View or Upload button side by
// side. `action` is a column holding only a button, such as Remove. `date`
// is a date the person picks, as wide as its date picker at the least.
export type ColumnKind =
  | "serial"
  | "short"
  | "standard"
  | "date"
  | "text"
  | "long"
  | "document"
  | "action"

// Each column also has a least width, so a choice still shows its answer and
// its caret, and a document its name beside its button. On a narrower table
// the least width shrinks with the table (the share after it), so even six
// columns never push the table wider than the sheet.
const tracks: Record<ColumnKind, string> = {
  serial: "min(5rem,10%)",
  short: "minmax(min(4rem,8%),0.75fr)",
  standard: "minmax(min(8.5rem,16%),1fr)",
  date: "minmax(min(11.5rem,22%),1fr)",
  text: "minmax(min(5rem,10%),1.5fr)",
  long: "minmax(min(6rem,12%),2.5fr)",
  document: "minmax(min(12rem,24%),2fr)",
  action: "3.5rem",
}

// The grid-template-columns of a table, from what each column holds.
export function widthsOf(kinds: readonly ColumnKind[]) {
  return kinds.map((kind) => tracks[kind]).join(" ")
}

// A column the app numbers, or one named SN, holds only "2.1" and the like.
function isSerial(column: Column) {
  return (
    column.numbered !== undefined ||
    column.key === "sn" ||
    column.label.trim().toUpperCase() === "SN"
  )
}

export function kindOf(column: Column): ColumnKind {
  if (isSerial(column)) {
    return "serial"
  }

  switch (column.type) {
    case "number":
    case "percentage":
    case "time":
    case "boolean":
      return "short"
    case "date":
      return column.systemFilled || column.inherited ? "standard" : "date"
    case "text":
      return "text"
    case "longText":
    case "instruction":
    case "staticList":
    case "checklist":
      return "long"
    case "pdfPreview":
    case "fileLink":
      return "document"
    default:
      return "standard"
  }
}

// A column of short text that the app fills with long values, such as D2.13's
// standard file names, is as wide as long text.
const longFixedText = 30

export function columnWidths(
  columns: readonly Column[],
  fixedRows: readonly Record<string, string>[] = []
) {
  return widthsOf(
    columns.map((column) => {
      const kind = kindOf(column)

      const longest = Math.max(
        0,
        ...fixedRows.map((row) => row[column.key]?.length ?? 0)
      )

      return kind === "text" && longest > longFixedText ? "long" : kind
    })
  )
}
