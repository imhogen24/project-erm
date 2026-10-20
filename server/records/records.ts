import { and, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import {
  recordStates,
  toolRecords,
  type JsonObject,
  type RecordState,
} from "@/db/schema"

export { recordStates }

export type { JsonObject, RecordState }

export type ToolRecord = {
  id: string
  projectId: string
  toolId: string
  state: RecordState
  payload: JsonObject
}

export class InvalidTransitionError extends Error {}

export class RecordNotEditableError extends Error {}

export class RecordNotFoundError extends Error {}

// Unlocking a locked record is a change request, which is a separate issue.
const allowedTransitions: Record<RecordState, readonly RecordState[]> = {
  draft: ["submitted"],
  submitted: ["approved", "draft"],
  approved: ["locked"],
  locked: [],
}

type NewRecord = {
  projectId: string
  toolId: string
  payload?: JsonObject
}

const columns = {
  id: toolRecords.id,
  projectId: toolRecords.projectId,
  toolId: toolRecords.toolId,
  state: toolRecords.state,
  payload: toolRecords.payload,
}

export async function createRecord(
  database: Database,
  input: NewRecord
): Promise<ToolRecord> {
  const [record] = await database
    .insert(toolRecords)
    .values({
      projectId: input.projectId,
      toolId: input.toolId,
      payload: input.payload ?? {},
    })
    .returning(columns)

  return record!
}

export async function getRecord(
  database: Database,
  recordId: string
): Promise<ToolRecord> {
  const [record] = await database
    .select(columns)
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  if (!record) {
    throw new RecordNotFoundError(`No record with id ${recordId}`)
  }

  return record
}

// The state check sits inside the UPDATE, so two simultaneous calls cannot
// both move the same record.
export async function transitionRecord(
  database: Database,
  recordId: string,
  to: RecordState
): Promise<ToolRecord> {
  const allowedFrom = recordStates.filter((from) =>
    allowedTransitions[from].includes(to)
  )

  const [moved] =
    allowedFrom.length === 0
      ? []
      : await database
          .update(toolRecords)
          .set({ state: to, updatedAt: new Date() })
          .where(
            and(
              eq(toolRecords.id, recordId),
              inArray(toolRecords.state, allowedFrom)
            )
          )
          .returning(columns)

  if (moved) {
    return moved
  }

  const current = await getRecord(database, recordId)

  throw new InvalidTransitionError(
    `A ${current.state} record cannot move to ${to}`
  )
}

export async function updateRecord(
  database: Database,
  recordId: string,
  payload: JsonObject
): Promise<ToolRecord> {
  const [updated] = await database
    .update(toolRecords)
    .set({ payload, updatedAt: new Date() })
    .where(and(eq(toolRecords.id, recordId), eq(toolRecords.state, "draft")))
    .returning(columns)

  if (updated) {
    return updated
  }

  const current = await getRecord(database, recordId)

  throw new RecordNotEditableError(`A ${current.state} record cannot be edited`)
}
