import { isDeepStrictEqual } from "node:util"

import type { Database } from "@/db"
import {
  auditLog,
  type AuditAction,
  type JsonObject,
  type JsonValue,
} from "@/db/schema"

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export type Change = {
  field: string
  oldValue: JsonValue | null
  newValue: JsonValue | null
}

// A line about the project itself has no record.
type Entry = {
  recordId: string | null
  projectId: string
  actor: string
  action: AuditAction
  reason?: string
}

// One change for each payload field whose value differs. A field that exists
// on only one side has nothing on the other.
export function payloadChanges(
  before: JsonObject,
  after: JsonObject
): Change[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: Change[] = []

  for (const key of keys) {
    if (!isDeepStrictEqual(before[key], after[key])) {
      changes.push({
        field: `payload.${key}`,
        oldValue: before[key] ?? null,
        newValue: after[key] ?? null,
      })
    }
  }

  return changes
}

export function stateChange(oldState: string | null, newState: string): Change {
  return { field: "state", oldValue: oldState, newValue: newState }
}

// Runs inside the caller's transaction, so the lines and the change they
// describe are saved together or not at all.
export async function writeAudit(
  transaction: Transaction,
  entry: Entry,
  changes: Change[]
): Promise<void> {
  if (changes.length === 0) {
    return
  }

  await transaction.insert(auditLog).values(
    changes.map((change) => ({
      recordId: entry.recordId,
      projectId: entry.projectId,
      actorId: entry.actor,
      action: entry.action,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      reason: entry.reason ?? null,
    }))
  )
}
