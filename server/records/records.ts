import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import {
  recordStates,
  toolRecords,
  type JsonObject,
  type RecordState,
} from "@/db/schema"
import {
  payloadChanges,
  stateChange,
  writeAudit,
  type Transaction,
} from "@/server/audit/audit"
import { assertGateOpen } from "@/server/gates/gates"
import { assertCan, type Action } from "@/server/permissions/permissions"

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
  actor: string,
  input: NewRecord
): Promise<ToolRecord> {
  await assertCan(database, actor, input.projectId, input.toolId, "write")
  await assertGateOpen(database, input.projectId, input.toolId)

  return database.transaction(async (transaction) => {
    const [record] = await transaction
      .insert(toolRecords)
      .values({
        projectId: input.projectId,
        toolId: input.toolId,
        payload: input.payload ?? {},
      })
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId: record!.id,
        projectId: input.projectId,
        actor,
        action: "created",
      },
      [stateChange(null, "draft"), ...payloadChanges({}, record!.payload)]
    )

    return record!
  })
}

// Reads the record and holds its row until the transaction ends, so a second
// call waits and then sees what the first one did.
async function lockRecord(
  transaction: Transaction,
  recordId: string
): Promise<ToolRecord> {
  const [record] = await transaction
    .select(columns)
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))
    .for("update")

  if (!record) {
    throw new RecordNotFoundError(`No record with id ${recordId}`)
  }

  return record
}

// Loads the record without a permission check, for the operations below that
// need its project and tool before they can check.
async function loadRecord(
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

export async function getRecord(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertCan(database, actor, record.projectId, record.toolId, "read")

  return record
}

// Sending a record forward or back is writing; approving and locking are approving.
const actionForMove: Record<RecordState, Action> = {
  draft: "write",
  submitted: "write",
  approved: "approve",
  locked: "approve",
}

// The record is locked while it is checked and moved, so two simultaneous
// calls cannot both move it.
export async function transitionRecord(
  database: Database,
  actor: string,
  recordId: string,
  to: RecordState
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertCan(
    database,
    actor,
    record.projectId,
    record.toolId,
    actionForMove[to]
  )

  return database.transaction(async (transaction) => {
    const current = await lockRecord(transaction, recordId)

    if (!allowedTransitions[current.state].includes(to)) {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot move to ${to}`
      )
    }

    const [moved] = await transaction
      .update(toolRecords)
      .set({ state: to, updatedAt: new Date() })
      .where(eq(toolRecords.id, recordId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "transitioned",
      },
      [stateChange(current.state, to)]
    )

    return moved!
  })
}

export async function updateRecord(
  database: Database,
  actor: string,
  recordId: string,
  payload: JsonObject
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertCan(database, actor, record.projectId, record.toolId, "write")

  return database.transaction(async (transaction) => {
    const current = await lockRecord(transaction, recordId)

    if (current.state !== "draft") {
      throw new RecordNotEditableError(
        `A ${current.state} record cannot be edited`
      )
    }

    const [updated] = await transaction
      .update(toolRecords)
      .set({ payload, updatedAt: new Date() })
      .where(eq(toolRecords.id, recordId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "updated",
      },
      payloadChanges(current.payload, payload)
    )

    return updated!
  })
}
