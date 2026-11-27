import { z } from "zod"

import type { JsonObject } from "@/db/schema"

// A table's rows as a record holds them, each a row of cells.
export const tableRows = z
  .array(z.record(z.string(), z.json()).catch({}))
  .catch([])

export type TableRows = z.output<typeof tableRows>

const keyOf = z.string().min(1).optional().catch(undefined)

// The rows of a table read from another tool (`rowsFrom`) as shown: each
// sourced row as the app fills it, with what the saved record holds under
// its key, then the saved rows the person added after them (`addRows`),
// which hold no key, as they were typed. A saved row whose key is no longer
// sourced is left out.
export function sourcedRows(
  sourced: JsonObject[],
  saved: TableRows,
  keyedBy: string
): JsonObject[] {
  const byKey = new Map(
    saved.flatMap((row) => {
      const key = keyOf.parse(row[keyedBy])

      return key ? [[key, row] as const] : []
    })
  )

  const added = saved.filter((row) => !keyOf.parse(row[keyedBy]))

  return [
    ...sourced.map((row) => {
      const key = keyOf.parse(row[keyedBy])

      return { ...(key ? byKey.get(key) : undefined), ...row }
    }),
    ...added,
  ]
}
