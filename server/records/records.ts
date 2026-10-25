import { DrizzleQueryError, and, eq } from "drizzle-orm"
import { DatabaseError } from "pg"

import type { Database } from "@/db"
import {
  changeRequests,
  recordStates,
  toolRecords,
  type JsonObject,
  type RecordState,
} from "@/db/schema"
import {
  changeRequestChange,
  payloadChanges,
  stateChange,
  writeAudit,
  type Transaction,
} from "@/server/audit/audit"
import { assertCan, type Action } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import {
  ToolNotAvailableError,
  applyHardStop,
  assertAvailable,
} from "@/server/workflow/workflow"

import { inheritedValues, readPayload, withoutInherited } from "./inherited"
import { assertValid } from "./validate"

export { ProjectNotActiveError } from "@/server/projects/projects"

export { ToolNotAvailableError } from "@/server/workflow/workflow"

export { UnknownToolError, ValidationError } from "./validate"

export { recordStates }

export type { JsonObject, RecordState }

export type ToolRecord = {
  id: string
  projectId: string
  toolId: string
  cycle: number
  state: RecordState
  payload: JsonObject
}

export class InvalidTransitionError extends Error {}

export class RecordNotEditableError extends Error {}

export class RecordNotFoundError extends Error {}

// A locked record leaves locked only through an approved change request, which
// reopens it as draft, or a workbook rollback, which reopens it as draft or
// voids it. A void record never moves again.
const allowedTransitions: Record<RecordState, readonly RecordState[]> = {
  draft: ["submitted"],
  submitted: ["approved", "draft"],
  approved: ["locked"],
  locked: [],
  void: [],
}

// `cycle` is for a tool that repeats once per payment milestone. Left out, the
// record gets the cycle the workflow map opens next.
type NewRecord = {
  projectId: string
  toolId: string
  cycle?: number
  payload?: JsonObject
}

const columns = {
  id: toolRecords.id,
  projectId: toolRecords.projectId,
  toolId: toolRecords.toolId,
  cycle: toolRecords.cycle,
  state: toolRecords.state,
  payload: toolRecords.payload,
}

// The workflow map must have the tool open on this project. Two simultaneous
// creates both find it open, so the unique index on tool and cycle refuses the
// second.
export async function createRecord(
  database: Database,
  actor: string,
  input: NewRecord
): Promise<ToolRecord> {
  await assertCan(database, actor, input.projectId, input.toolId, "write")

  // A new record is a draft, so required fields are not checked yet.
  const payload = assertValid(input.toolId, input.payload ?? {}, {
    forSubmit: false,
  })

  try {
    return await database.transaction(async (transaction) => {
      await assertProjectActive(transaction, input.projectId)

      const cycle = await assertAvailable(
        transaction,
        input.projectId,
        input.toolId,
        input.cycle
      )

      const [record] = await transaction
        .insert(toolRecords)
        .values({
          projectId: input.projectId,
          toolId: input.toolId,
          cycle,
          payload,
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
  } catch (error) {
    // Drizzle wraps the driver's error, so the broken rule is on its cause.
    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof DatabaseError &&
      error.cause.constraint === "tool_records_one_live_per_cycle"
    ) {
      throw new ToolNotAvailableError(
        `${input.toolId} cannot be started: ${input.toolId} already has a record`
      )
    }

    throw error
  }
}

// Reads the record and holds its row until the transaction ends, so a second
// call waits and then sees what the first one did.
export async function lockRecord(
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

  return { ...record, payload: await readPayload(database, record) }
}

// Sending a record forward or back is writing; approving and locking are approving.
// There is no move into void: only a workbook rollback voids a record.
const actionForMove: Record<Exclude<RecordState, "void">, Action> = {
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
  if (to === "void") {
    throw new InvalidTransitionError(
      "A record becomes void only through a workbook rollback"
    )
  }

  const record = await loadRecord(database, recordId)

  await assertCan(
    database,
    actor,
    record.projectId,
    record.toolId,
    actionForMove[to]
  )

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (!allowedTransitions[current.state].includes(to)) {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot move to ${to}`
      )
    }

    const submitting = current.state === "draft" && to === "submitted"

    // Submitting is when a draft must be complete, and when its inherited
    // fields are copied in from their sources, so the submitted copy never
    // changes after. A draft sent back may still hold an earlier copy, which
    // the new one replaces.
    let payload = current.payload

    if (submitting) {
      const written = withoutInherited(current.toolId, current.payload)

      assertValid(current.toolId, written, { forSubmit: true })

      payload = {
        ...written,
        ...(await inheritedValues(transaction, current)),
      }
    }

    const [moved] = await transaction
      .update(toolRecords)
      .set({ state: to, payload, updatedAt: new Date() })
      .where(eq(toolRecords.id, recordId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "updated",
        reason: "Inherited values copied on submit",
      },
      payloadChanges(current.payload, payload)
    )

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

    if (to === "locked") {
      await applyApprovedChange(transaction, actor, current)
      await applyHardStop(transaction, actor, current)
    }

    return moved!
  })
}

// Locking a record that an approved change request reopened completes that
// request.
async function applyApprovedChange(
  transaction: Transaction,
  actor: string,
  record: ToolRecord
): Promise<void> {
  const [applied] = await transaction
    .update(changeRequests)
    .set({ status: "applied", appliedAt: new Date() })
    .where(
      and(
        eq(changeRequests.recordId, record.id),
        eq(changeRequests.status, "approved")
      )
    )
    .returning({ id: changeRequests.id })

  if (!applied) {
    return
  }

  await writeAudit(
    transaction,
    {
      recordId: record.id,
      projectId: record.projectId,
      actor,
      action: "change_applied",
    },
    [changeRequestChange(applied.id, "approved", "applied")]
  )
}

export async function updateRecord(
  database: Database,
  actor: string,
  recordId: string,
  payload: JsonObject
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertCan(database, actor, record.projectId, record.toolId, "write")

  // Only a draft can be edited, so required fields are not checked here.
  const checked = assertValid(record.toolId, payload, { forSubmit: false })

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "draft") {
      throw new RecordNotEditableError(
        `A ${current.state} record cannot be edited`
      )
    }

    const [updated] = await transaction
      .update(toolRecords)
      .set({ payload: checked, updatedAt: new Date() })
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
      payloadChanges(current.payload, checked)
    )

    return updated!
  })
}
