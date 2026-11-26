import { eq } from "drizzle-orm"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { systemActor } from "@/server/system/system"
import { tools } from "@/server/tools/registry"

import { nextEntryOf } from "./kept-entries"
import { reopen } from "./send-back"

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
  const next = nextEntryOf(record.toolId, record.payload)

  if (!repeat || !next || record.payload[repeat.field] !== repeat.is) {
    return undefined
  }

  await reopen(
    transaction,
    systemActor,
    record,
    `${record.toolId} locked with ${repeat.is}: the next entry is open`,
    { payload: next, note: "Entry kept, next one started" }
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
