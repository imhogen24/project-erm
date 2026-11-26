import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { shownFor } from "./signatures"

// Kept apart from server/records/repeat, which reopens through
// server/records/send-back, so send-back can start a next entry too.

const rows = z.array(z.record(z.string(), z.unknown())).catch([])

// The locked entry as a row of the table it is kept in: each column holds
// the field of the same key, when the entry shows that field.
export function keptRow(toolId: string, payload: JsonObject): JsonObject {
  const tool = tools.getTool(toolId)
  const repeat = tool?.repeatsWhile
  const table = tool?.fields.find((field) => field.key === repeat?.keepsIn)

  if (!tool || table?.type !== "table") {
    return {}
  }

  return Object.fromEntries(
    table.columns.flatMap((column) => {
      const field = tool.fields.find((entry) => entry.key === column.key)
      const value = payload[column.key]

      return field && shownFor(field, payload) && value !== undefined
        ? [[column.key, value]]
        : []
    })
  )
}

// The next entry of a tool that repeats (`repeatsWhile`), after the locked
// one: empty, but for the table that keeps each entry, with the locked one
// as its first row, so they read newest first. Undefined for a tool that
// does not repeat.
export function nextEntryOf(
  toolId: string,
  payload: JsonObject
): JsonObject | undefined {
  const repeat = tools.getTool(toolId)?.repeatsWhile

  if (!repeat) {
    return undefined
  }

  const kept = [
    keptRow(toolId, payload),
    ...rows.parse(payload[repeat.keepsIn]),
  ]

  // SAFETY: rows of cells read from the locked payload.
  return { [repeat.keepsIn]: kept as JsonObject[] }
}
