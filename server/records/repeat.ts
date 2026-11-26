import { eq } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { systemActor } from "@/server/system/system"
import { tools } from "@/server/tools/registry"

import { reopen } from "./send-back"
import { shownFor } from "./signatures"

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

// Runs inside the transaction that locked `record`. A tool that repeats on
// the answer it was locked with, such as D3.7 with Continue waiting, reopens
// at once as its next iteration: empty, but for the table that keeps each
// entry, with the one just locked as its first row, so they read newest
// first. Returns the reopened record, or undefined when it stays locked.
export async function repeatIfAsked<
  Locked extends {
    id: string
    projectId: string
    toolId: string
    payload: JsonObject
    updatedAt: Date
  },
>(transaction: Transaction, record: Locked): Promise<Locked | undefined> {
  const repeat = tools.getTool(record.toolId)?.repeatsWhile

  if (!repeat || record.payload[repeat.field] !== repeat.is) {
    return undefined
  }

  const kept = [
    keptRow(record.toolId, record.payload),
    ...rows.parse(record.payload[repeat.keepsIn]),
  ]

  await reopen(
    transaction,
    systemActor,
    record,
    `${record.toolId} locked with ${repeat.is}: the next entry is open`,
    {
      // SAFETY: rows of cells read from the locked payload.
      payload: { [repeat.keepsIn]: kept as JsonObject[] },
      note: "Entry kept, next one started",
    }
  )

  const [reopened] = await transaction
    .select({
      state: toolRecords.state,
      payload: toolRecords.payload,
      updatedAt: toolRecords.updatedAt,
    })
    .from(toolRecords)
    .where(eq(toolRecords.id, record.id))

  return { ...record, ...reopened! }
}
