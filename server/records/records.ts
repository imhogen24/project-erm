import { isDeepStrictEqual } from "node:util"

import { DrizzleQueryError, and, eq, ne } from "drizzle-orm"
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
import {
  PermissionDeniedError,
  assertCan,
  rolesOn,
  type Action,
} from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import { systemActor } from "@/server/system/system"
import {
  ToolNotAvailableError,
  applyHardStop,
  assertAvailable,
} from "@/server/workflow/workflow"

import { inheritedValues, readPayload, withoutInherited } from "./inherited"
import {
  signatureField,
  signaturesOf,
  unsignedFields,
  withoutSignatures,
} from "./signatures"
import { ValidationError, assertValid } from "./validate"

export { ProjectNotActiveError } from "@/server/projects/projects"

export { ToolNotAvailableError } from "@/server/workflow/workflow"

export { UnknownToolError, ValidationError } from "./validate"

export { recordStates }

export type { JsonObject, RecordState }

// `updatedAt` is what a screen sends back with its next save, so a save made
// over someone else's newer one is refused.
export type ToolRecord = {
  id: string
  projectId: string
  toolId: string
  cycle: number
  state: RecordState
  payload: JsonObject
  updatedAt: Date
  submittedBy: string | null
  submittedAt: Date | null
  approvedBy: string | null
  approvedAt: Date | null
  lockedAt: Date | null
}

export class InvalidTransitionError extends Error {}

export class RecordNotEditableError extends Error {}

export class RecordNotFoundError extends Error {}

export class SelfApprovalError extends Error {}

// Carries the newer record, so the screen can show what changed.
export class StaleRecordError extends Error {
  readonly record: ToolRecord

  constructor(record: ToolRecord) {
    super("Someone else saved this record after you opened it")
    this.record = record
  }
}

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

// `expectedUpdatedAt` is the `updatedAt` of the record the screen opened, or
// left out when the tool had no record yet.
type DraftSave = {
  projectId: string
  toolId: string
  cycle: number
  values: JsonObject
  expectedUpdatedAt?: Date
}

const columns = {
  id: toolRecords.id,
  projectId: toolRecords.projectId,
  toolId: toolRecords.toolId,
  cycle: toolRecords.cycle,
  state: toolRecords.state,
  payload: toolRecords.payload,
  updatedAt: toolRecords.updatedAt,
  submittedBy: toolRecords.submittedBy,
  submittedAt: toolRecords.submittedAt,
  approvedBy: toolRecords.approvedBy,
  approvedAt: toolRecords.approvedAt,
  lockedAt: toolRecords.lockedAt,
}

// Always later than the record's last save, even within one millisecond, so
// a save made over it can always be told apart from it.
function nextUpdatedAt(record: ToolRecord): Date {
  return new Date(Math.max(Date.now(), record.updatedAt.getTime() + 1))
}

// The system holds no roles, so it skips the permission check to read and
// write, but it can never approve or lock. Every check after this one still
// applies to it.
async function assertMay(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string,
  action: Action
): Promise<void> {
  if (actor !== systemActor) {
    await assertCan(database, actor, projectId, toolId, action)

    return
  }

  if (action === "approve") {
    throw new PermissionDeniedError(
      `The system may not approve or lock ${toolId}`
    )
  }
}

// The workflow map must have the tool open on this project. Two simultaneous
// creates both find it open, so the unique index on tool and cycle refuses the
// second.
export async function createRecord(
  database: Database,
  actor: string,
  input: NewRecord
): Promise<ToolRecord> {
  await assertMay(database, actor, input.projectId, input.toolId, "write")

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

  await assertMay(database, actor, record.projectId, record.toolId, "read")

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

// Moves a record the caller has locked one step, and records who moved it and
// when. Approving needs every signature field signed.
async function move(
  transaction: Transaction,
  actor: string,
  current: ToolRecord,
  to: Exclude<RecordState, "void">
): Promise<ToolRecord> {
  if (!allowedTransitions[current.state].includes(to)) {
    throw new InvalidTransitionError(
      `A ${current.state} record cannot move to ${to}`
    )
  }

  const submitting = current.state === "draft" && to === "submitted"

  // Submitting is when a draft must be complete, and when its inherited
  // fields are copied in from their sources, so the submitted copy never
  // changes after. A draft sent back may still hold an earlier copy, which
  // the new one replaces. Signatures are written only by signing, so they are
  // kept but not checked as values.
  let payload = current.payload

  if (submitting) {
    const written = withoutInherited(current.toolId, current.payload)

    assertValid(current.toolId, withoutSignatures(current.toolId, written), {
      forSubmit: true,
    })

    payload = {
      ...written,
      ...(await inheritedValues(transaction, current)),
    }
  }

  if (to === "approved") {
    const unsigned = unsignedFields(current.toolId, current.payload)

    if (unsigned.length > 0) {
      throw new ValidationError(unsigned)
    }
  }

  const now = new Date()

  const [moved] = await transaction
    .update(toolRecords)
    .set({
      state: to,
      payload,
      updatedAt: nextUpdatedAt(current),
      ...(to === "submitted" && { submittedBy: actor, submittedAt: now }),
      ...(to === "approved" && { approvedBy: actor, approvedAt: now }),
      ...(to === "locked" && { lockedAt: now }),
    })
    .where(eq(toolRecords.id, current.id))
    .returning(columns)

  await writeAudit(
    transaction,
    {
      recordId: current.id,
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
      recordId: current.id,
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
}

// The record is locked while it is checked and moved, so two simultaneous
// calls cannot both move it. Screens use the steps below; this is the single
// move they are built from.
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

  await assertMay(
    database,
    actor,
    record.projectId,
    record.toolId,
    actionForMove[to]
  )

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    return move(transaction, actor, await lockRecord(transaction, recordId), to)
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

// Saves checked values over a draft the caller has locked. A signature vouches
// for the values it was given on, so editing any other field clears every
// signature, with its own audit lines. Saving the same values changes nothing.
async function writeDraft(
  transaction: Transaction,
  actor: string,
  current: ToolRecord,
  values: JsonObject
): Promise<ToolRecord> {
  if (current.state !== "draft") {
    throw new RecordNotEditableError(
      `A ${current.state} record cannot be edited`
    )
  }

  const before = withoutSignatures(current.toolId, current.payload)
  const signatures = signaturesOf(current.toolId, current.payload)

  const edited = !isDeepStrictEqual(
    withoutInherited(current.toolId, before),
    values
  )

  const payload = edited ? values : { ...values, ...signatures }

  if (isDeepStrictEqual(payload, current.payload)) {
    return current
  }

  const [updated] = await transaction
    .update(toolRecords)
    .set({ payload, updatedAt: nextUpdatedAt(current) })
    .where(eq(toolRecords.id, current.id))
    .returning(columns)

  const entry = {
    recordId: current.id,
    projectId: current.projectId,
    actor,
    action: "updated" as const,
  }

  await writeAudit(transaction, entry, payloadChanges(before, values))

  if (edited) {
    await writeAudit(
      transaction,
      { ...entry, reason: "Signatures cleared: the record was edited" },
      payloadChanges(signatures, {})
    )
  }

  return updated!
}

export async function updateRecord(
  database: Database,
  actor: string,
  recordId: string,
  payload: JsonObject
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertMay(database, actor, record.projectId, record.toolId, "write")

  // Only a draft can be edited, so required fields are not checked here.
  const checked = assertValid(record.toolId, payload, { forSubmit: false })

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    return writeDraft(
      transaction,
      actor,
      await lockRecord(transaction, recordId),
      checked
    )
  })
}

// The record of the tool and cycle that is not void, if there is one.
async function liveRecord(
  database: Pick<Database, "select">,
  input: Pick<DraftSave, "projectId" | "toolId" | "cycle">
): Promise<ToolRecord | undefined> {
  const [record] = await database
    .select(columns)
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, input.projectId),
        eq(toolRecords.toolId, input.toolId),
        eq(toolRecords.cycle, input.cycle),
        ne(toolRecords.state, "void")
      )
    )

  return record
}

// The newer record goes back as the screen would show it.
async function staleError(
  database: Pick<Database, "select">,
  record: ToolRecord
): Promise<StaleRecordError> {
  return new StaleRecordError({
    ...record,
    payload: await readPayload(database, record),
  })
}

// Creates the tool's record for the cycle when it has none, if the workflow
// has the tool open, or saves over its draft. A save is refused with
// StaleRecordError, changing nothing, when the record is not the one the
// screen opened: someone created it, or saved it, in between. Saving never
// needs the whole form to be valid; only submitting does.
export async function saveDraft(
  database: Database,
  actor: string,
  input: DraftSave
): Promise<ToolRecord> {
  await assertMay(database, actor, input.projectId, input.toolId, "write")

  const values = assertValid(input.toolId, input.values, { forSubmit: false })
  const expected = input.expectedUpdatedAt
  const existing = await liveRecord(database, input)

  if (!existing && expected) {
    throw new RecordNotFoundError(
      `${input.toolId} no longer has a record for this cycle`
    )
  }

  if (!existing) {
    try {
      return await createRecord(database, actor, {
        projectId: input.projectId,
        toolId: input.toolId,
        cycle: input.cycle,
        payload: values,
      })
    } catch (error) {
      const created =
        error instanceof ToolNotAvailableError &&
        (await liveRecord(database, input))

      if (created) {
        throw await staleError(database, created)
      }

      throw error
    }
  }

  if (!expected) {
    throw await staleError(database, existing)
  }

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, existing.projectId)

    const current = await lockRecord(transaction, existing.id)

    if (current.updatedAt.getTime() !== expected.getTime()) {
      throw await staleError(transaction, current)
    }

    return writeDraft(transaction, actor, current, values)
  })
}

// Sends a complete draft to be approved, and records who submitted it.
export async function submitRecord(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  return transitionRecord(database, actor, recordId, "submitted")
}

// Writes who signed and when into a signature field of a draft or submitted
// record. Only a person holding one of the roles the field names may sign.
export async function signField(
  database: Database,
  actor: string,
  recordId: string,
  fieldKey: string
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)
  const field = signatureField(record.toolId, fieldKey)

  if (!field) {
    throw new ValidationError([
      { field: fieldKey, message: "Not a signature field of this tool" },
    ])
  }

  const signers = field.signedBy ?? []
  const held = await rolesOn(database, actor, record.projectId)

  if (!signers.some((role) => held.includes(role))) {
    throw new PermissionDeniedError(
      `Only ${signers.join(", ")} may sign ${field.label}`
    )
  }

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "draft" && current.state !== "submitted") {
      throw new RecordNotEditableError(
        `A ${current.state} record cannot be signed`
      )
    }

    const payload = {
      ...current.payload,
      [fieldKey]: { signedBy: actor, signedAt: new Date().toISOString() },
    }

    const [updated] = await transaction
      .update(toolRecords)
      .set({ payload, updatedAt: nextUpdatedAt(current) })
      .where(eq(toolRecords.id, recordId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "updated",
        reason: "Signed",
      },
      payloadChanges(current.payload, payload)
    )

    return updated!
  })
}

// Approves a submitted record and locks it in one transaction, since the next
// tool opens when this one is locked. The person who submitted it may not
// approve it, even when they also hold a role that approves: the check is on
// the person. Every signature field must be signed.
export async function approveRecord(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertMay(database, actor, record.projectId, record.toolId, "approve")

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "submitted") {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot be approved`
      )
    }

    if (current.submittedBy === actor) {
      throw new SelfApprovalError(
        "The person who submitted this record cannot approve it"
      )
    }

    const approved = await move(transaction, actor, current, "approved")

    return move(transaction, actor, approved, "locked")
  })
}
