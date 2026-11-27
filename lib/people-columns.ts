import { z } from "zod"

import type { Field, FormValues, TableField } from "@/lib/tool-definition"

const rows = z.array(z.record(z.string(), z.unknown()).catch({})).catch([])

const name = z.string().trim().catch("")

type Source = { field: string; column: string }

// Where a select column takes its people from another column of the same
// record, such as D4.3's 3.0 engineers from its 2.0 roster.
function columnSource(column: TableField["columns"][number]): Source | null {
  return column.type === "select" && column.optionsFromPeople?.from === "column"
    ? column.optionsFromPeople
    : null
}

// The fields whose cells such selects list, so the form follows them as
// they are typed.
export function peopleColumnSources(fields: readonly Field[]): string[] {
  return [
    ...new Set(
      fields.flatMap((field) =>
        field.type === "table"
          ? field.columns.flatMap((column) => {
              const source = columnSource(column)

              return source ? [source.field] : []
            })
          : []
      )
    ),
  ]
}

// The names `column` of the `field` table holds, in order, each once.
export function namesIn(values: FormValues, source: Source): string[] {
  return [
    ...new Set(
      rows
        .parse(values[source.field])
        .map((row) => name.parse(row[source.column]))
        .filter((each) => each !== "")
    ),
  ]
}

// The table with each select of a "column" source listing the names the
// record holds there now, before its own options. The same table when it
// has none.
export function withColumnPeople(
  table: TableField,
  values: FormValues
): TableField {
  if (!table.columns.some((column) => columnSource(column))) {
    return table
  }

  return {
    ...table,
    columns: table.columns.map((column) => {
      const source = columnSource(column)

      if (!source || column.type !== "select") {
        return column
      }

      const names = namesIn(values, source)

      return {
        ...column,
        options: [
          ...names.filter((each) => !column.options.includes(each)),
          ...column.options,
        ],
      }
    }),
  }
}
