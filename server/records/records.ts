import { isDeepStrictEqual } from "node:util"

import { DrizzleQueryError, and, desc, eq, ne } from "drizzle-orm"
import { DatabaseError } from "pg"
import { z } from "zod"

import type { Database } from "@/db"
import {
  auditLog,
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
import { haltedFor } from "@/server/permissions/work-halted"
import type { Transport } from "@/server/email/email"
import {
  clearApprovalNeeded,
  clearSignatureNeeded,
  notifyApprovalNeeded,
  notifyLockAnnounced,
  notifySentBack,
  notifySignatureNeeded,
  notifyToolsOpened,
  sendNotificationEmails,
  type PendingEmail,
} from "@/server/notifications/raise"
import { assertProjectActive } from "@/server/projects/projects"
import { systemActor } from "@/server/system/system"
import { tools } from "@/server/tools/registry"
import {
  ToolNotAvailableError,
  applyHardStop,
  assertAvailable,
  openToolsIn,
} from "@/server/workflow/workflow"

import {
  inheritedValues,
  readPayload,
  withoutHiddenAnswers,
  withoutInherited,
} from "./inherited"
import { lockValues, setOnLockValues, unmetSubmitRules } from "./filled-on-lock"
import { rowsNotNeeded } from "./not-needed"
import { fieldsOff } from "./only-when"
import { repeatIfAsked } from "./repeat"
import { keepReadOnly } from "./read-only"
import {
  hasInternalFields,
  readsAsClient,
  withoutInternalValues,
} from "./shown-fields"
import { applySendBack } from "./send-back"
import { answersSendBack } from "@/lib/send-back"
import { fillText, placeholdersIn } from "@/lib/placeholders"
import { submittedValues } from "./submitted-values"
import { decisionValues, heldDecision, withoutDecision } from "./decision"
import { heldIssued, issuedValues } from "./issued"
import { datedKeys, datedOnSave } from "./dated-on-save"
import { figuresOnLock } from "./figures-on-lock"
import { announceWorkResumed } from "./work-resumed"
import { unmetOptionsFrom } from "./options-from"
import {
  approvingTurn,
  nextTurn,
  signatureField,
  signaturesOf,
  turnsOf,
  turnsOpen,
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
  // The app job opening a tool only it opens, such as D3.11. Only the
  // system actor's create counts as one.
  byJob?: true
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
  database: Pick<Database, "select">,
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
  input: NewRecord,
  transport?: Transport
): Promise<ToolRecord> {
  const outbox: PendingEmail[] = []

  try {
    const record = await database.transaction(async (transaction) => {
      const created = await createRecordIn(transaction, actor, input)

      outbox.push(...(await askOnStart(transaction, actor, created)))

      return created
    })

    await sendNotificationEmails(database, outbox, transport)

    return record
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

// The same, inside the caller's transaction, so the website intake saves D1.1
// together with the project it belongs to.
export async function createRecordIn(
  transaction: Transaction,
  actor: string,
  input: NewRecord
): Promise<ToolRecord> {
  await assertMay(transaction, actor, input.projectId, input.toolId, "write")

  // A new record is a draft, so required fields are not checked yet.
  const payload = assertValid(input.toolId, input.payload ?? {}, {
    forSubmit: false,
  })

  await assertProjectActive(transaction, input.projectId)

  const cycle = await assertAvailable(
    transaction,
    input.projectId,
    input.toolId,
    input.cycle,
    input.byJob === true && actor === systemActor
  )

  // A number the record is given, such as D3.4's invoice number, is taken
  // here, so a record that cannot be created never uses one up.
  const [record] = await transaction
    .insert(toolRecords)
    .values({
      projectId: input.projectId,
      toolId: input.toolId,
      cycle,
      payload: {
        ...payload,
        ...(await issuedValues(transaction, input.toolId)),
      },
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

// The record as this person's screen shows it.
// A tool the client reads only once locked shows them nothing before. Someone
// who also holds a staff role on the project reads it as staff.
export async function hiddenFromClient(
  database: Pick<Database, "select">,
  actor: string,
  record: { projectId: string; toolId: string; state: RecordState }
): Promise<boolean> {
  if (
    record.state === "locked" ||
    !tools.getTool(record.toolId)?.clientReadsOnceLocked
  ) {
    return false
  }

  const held = await rolesOn(database, actor, record.projectId)

  return held.length > 0 && held.every((role) => role === "Client")
}

async function asShownTo(
  database: Pick<Database, "select">,
  actor: string,
  record: ToolRecord
): Promise<ToolRecord> {
  if (await hiddenFromClient(database, actor, record)) {
    return { ...record, payload: {} }
  }

  const payload = await readPayload(database, record)

  const shown = await withoutHiddenAnswers(database, actor, {
    ...record,
    payload,
  })

  // The client never gets the values of IMHOGEN's own fields, such as the
  // hard limits kept in view before a negotiation.
  return {
    ...record,
    payload:
      hasInternalFields(record.toolId) &&
      (await readsAsClient(database, actor, record.projectId))
        ? withoutInternalValues(record.toolId, shown)
        : shown,
  }
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

  return await asShownTo(database, actor, record)
}

// Sending a record forward or back is writing; approving and locking are approving.
// There is no move into void: only a workbook rollback voids a record.
const actionForMove: Record<Exclude<RecordState, "void">, Action> = {
  draft: "write",
  submitted: "write",
  approved: "approve",
  locked: "approve",
}

const rowObject = z.record(z.string(), z.json())

// What the system wrote, such as an invite's time, a table the system keeps
// or a row's worked-out total, is not the writer's to answer, so submitting
// does not check it.
function withoutSystemValues(toolId: string, payload: JsonObject): JsonObject {
  const fields = tools.getTool(toolId)?.fields ?? []

  return Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]) => {
      const field = fields.find((each) => each.key === key)

      if (field?.systemFilled || (field?.type === "table" && field.readOnly)) {
        return []
      }

      if (field?.type !== "table" || !Array.isArray(value)) {
        return [[key, value]]
      }

      const system = field.columns
        .filter((column) => column.systemFilled)
        .map((column) => column.key)

      if (system.length === 0) {
        return [[key, value]]
      }

      return [
        [
          key,
          value.map((row) => {
            const cells = rowObject.safeParse(row)

            return cells.success
              ? Object.fromEntries(
                  Object.entries(cells.data).filter(
                    ([column]) => !system.includes(column)
                  )
                )
              : row
          }),
        ],
      ]
    })
  )
}

// Moves a record the caller has locked one step, and records who moved it and
// when. Approving needs every signature field signed. Locking notifies the
// people who write each tool the lock opens. Emails it raises go into
// `outbox`, for the caller to send once the transaction commits. `said` is
// why a review locked with its send-back answer sent the work back.
async function move(
  transaction: Transaction,
  actor: string,
  current: ToolRecord,
  to: Exclude<RecordState, "void">,
  outbox: PendingEmail[],
  said?: string
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

    assertValid(
      current.toolId,
      withoutSystemValues(
        current.toolId,
        withoutSignatures(current.toolId, written)
      ),
      { forSubmit: true }
    )

    // What submitting works out, such as D3.7's variance, is what the
    // submit rules read beside the answers.
    const worked = await submittedValues(transaction, current)

    const unmet = [
      ...(tools.getTool(current.toolId)?.submitNeeds ?? []).filter(
        (need) =>
          !current.payload[need.field] &&
          !(
            need.unless && current.payload[need.unless.field] === need.unless.is
          )
      ),
      ...unmetSubmitRules(
        current.toolId,
        { ...current.payload, ...worked.values },
        await rowsNotNeeded(transaction, current.projectId, current.toolId)
      ),
    ]

    if (unmet.length > 0) {
      throw new ValidationError(unmet)
    }

    // A pick from another tool's table must still be one of its rows, and
    // not one another record already holds.
    const errors = [
      ...worked.errors,
      ...(await unmetOptionsFrom(transaction, current)),
    ]

    if (errors.length > 0) {
      throw new ValidationError(errors)
    }

    payload = {
      ...withoutDecision(current.toolId, written),
      ...(await inheritedValues(transaction, current)),
      ...worked.values,
    }
  }

  // A tool signed in turn is approved by a signature, and locked by the
  // last one, so the signatures after the approving one wait for the lock.
  const signedInTurn = turnsOf(current.toolId) !== undefined

  if (to === "approved" || (to === "locked" && signedInTurn)) {
    const unsigned = unsignedFields(current.toolId, current.payload, {
      forApproval: to === "approved",
      off: await fieldsOff(
        transaction,
        current.projectId,
        current.toolId,
        current.payload
      ),
    })

    if (unsigned.length > 0) {
      throw new ValidationError(unsigned)
    }
  }

  // What the workflow offered before this lock, so the tools it opens can be
  // told apart from those already open.
  const openBefore =
    to === "locked" ? await openToolsIn(transaction, current.projectId) : []

  const now = new Date()

  // Locking fills in the fields that record who submitted and when it locked,
  // such as D2.2's Drafted By.
  if (to === "locked") {
    payload = {
      ...payload,
      ...(await lockValues(transaction, current, actor, now)),
      ...(await decisionValues(transaction, current, actor, "approve")),
    }

    payload = {
      ...payload,
      ...setOnLockValues(current.toolId, payload),
      ...(await figuresOnLock(transaction, current, now)),
    }
  }

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
      reason:
        to === "locked"
          ? "Filled in when locked"
          : "Inherited values copied on submit",
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
    await applySendBack(transaction, actor, moved!, outbox, said)
    await applyHardStop(transaction, actor, current)

    await notifyToolsOpened(
      transaction,
      actor,
      current.projectId,
      openBefore,
      await openToolsIn(transaction, current.projectId)
    )

    outbox.push(...(await announceLock(transaction, actor, moved!)))
    outbox.push(...(await announceWorkResumed(transaction, actor, moved!)))
  }

  return moved!
}

// The tool's `announcesOnLock`, once its record locks: the roles it names
// told its message, each [key] filled from the locked record.
async function announceLock(
  transaction: Transaction,
  actor: string,
  record: ToolRecord
): Promise<PendingEmail[]> {
  const announced = tools.getTool(record.toolId)?.announcesOnLock

  if (
    !announced ||
    (announced.when &&
      record.payload[announced.when.field] !== announced.when.is)
  ) {
    return []
  }

  const fills = Object.fromEntries(
    placeholdersIn(announced.message).map((key) => [
      key,
      String(record.payload[key] ?? ""),
    ])
  )

  return notifyLockAnnounced(
    transaction,
    actor,
    record,
    announced.notifies,
    fillText(announced.message, fills)
  )
}

// The record is locked while it is checked and moved, so two simultaneous
// calls cannot both move it. Screens use the steps below; this is the single
// move they are built from.
export async function transitionRecord(
  database: Database,
  actor: string,
  recordId: string,
  to: RecordState,
  transport?: Transport
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

  const { moved, emails } = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)
    const outbox: PendingEmail[] = []
    const result = await move(transaction, actor, current, to, outbox)

    // A tool with no approver locks as it is submitted, in the same
    // transaction, so the tools after it open and nobody is asked to approve.
    if (to === "submitted" && tools.getTool(record.toolId)?.locksOnSubmit) {
      const approved = await move(
        transaction,
        actor,
        result,
        "approved",
        outbox
      )

      const locked = await move(transaction, actor, approved, "locked", outbox)

      // A tool that repeats on this answer, such as D3.7 with Continue
      // waiting, opens its next entry at once.
      return {
        moved: (await repeatIfAsked(transaction, locked)) ?? locked,
        emails: outbox,
      }
    }

    // A tool signed in turn asks for its first signature instead of an
    // approval.
    if (to === "submitted" && turnsOf(record.toolId)) {
      outbox.push(...(await askNextSignature(transaction, actor, result)))

      return { moved: result, emails: outbox }
    }

    return {
      moved: result,
      emails: [
        ...outbox,
        ...(to === "submitted"
          ? await notifyApprovalNeeded(transaction, actor, result)
          : []),
      ],
    }
  })

  await sendNotificationEmails(database, emails, transport)

  return moved
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

  const kept = {
    ...keepReadOnly(current.toolId, current.payload, values),
    ...heldDecision(current.toolId, current.payload),
    ...heldIssued(current.toolId, current.payload),
  }

  for (const key of datedKeys(current.toolId)) {
    delete kept[key]
  }

  const next = {
    ...kept,
    ...datedOnSave(current.toolId, current.payload, kept),
  }

  const edited = !isDeepStrictEqual(
    withoutInherited(current.toolId, before),
    next
  )

  // A tool signed from a field is signed for what it sent, which an edit can
  // no longer change (freezesOnceSet), so its signatures stay.
  const turns = turnsOf(current.toolId)
  const keeps = turns !== undefined && "from" in turns

  const payload = edited && !keeps ? next : { ...next, ...signatures }

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

  await writeAudit(transaction, entry, payloadChanges(before, next))

  if (edited && !keeps) {
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
  actor: string,
  record: ToolRecord
): Promise<StaleRecordError> {
  return new StaleRecordError(await asShownTo(database, actor, record))
}

// Creates the tool's record for the cycle when it has none, if the workflow
// has the tool open, or saves over its draft. A save is refused with
// StaleRecordError, changing nothing, when the record is not the one the
// screen opened: someone created it, or saved it, in between. Saving never
// needs the whole form to be valid; only submitting does.
export async function saveDraft(
  database: Database,
  actor: string,
  input: DraftSave,
  transport?: Transport
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
    const first = keepReadOnly(input.toolId, undefined, values)

    try {
      return await createRecord(
        database,
        actor,
        {
          projectId: input.projectId,
          toolId: input.toolId,
          cycle: input.cycle,
          payload: first,
        },
        transport
      )
    } catch (error) {
      const created =
        error instanceof ToolNotAvailableError &&
        (await liveRecord(database, input))

      if (created) {
        throw await staleError(database, actor, created)
      }

      throw error
    }
  }

  if (!expected) {
    throw await staleError(database, actor, existing)
  }

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, existing.projectId)

    const current = await lockRecord(transaction, existing.id)

    if (current.updatedAt.getTime() !== expected.getTime()) {
      throw await staleError(transaction, actor, current)
    }

    return writeDraft(transaction, actor, current, values)
  })
}

// Sends a complete draft to be approved, and records who submitted it. The
// people who may approve the tool are notified in the same transaction, and
// emailed once it commits.
export async function submitRecord(
  database: Database,
  actor: string,
  recordId: string,
  transport?: Transport
): Promise<ToolRecord> {
  return transitionRecord(database, actor, recordId, "submitted", transport)
}

// Tells whoever signs each `askedOnStart` signature the project asks for,
// once its record is started, such as the FO on a negotiated D2.10.
async function askOnStart(
  transaction: Transaction,
  actor: string,
  record: ToolRecord
): Promise<PendingEmail[]> {
  const off = await fieldsOff(
    transaction,
    record.projectId,
    record.toolId,
    record.payload
  )

  const emails: PendingEmail[] = []

  for (const field of tools.getTool(record.toolId)?.fields ?? []) {
    if (
      field.type !== "signature" ||
      !field.askedOnStart ||
      off.has(field.key)
    ) {
      continue
    }

    emails.push(
      ...(await notifySignatureNeeded(transaction, actor, record, {
        label: field.label,
        signedBy: field.signedBy ?? [],
      }))
    )
  }

  return emails
}

// Asks whoever signs next on a record signed in turn, in the app, and returns
// the emails to send once the transaction commits.
export async function askNextSignature(
  transaction: Transaction,
  actor: string,
  record: ToolRecord
): Promise<PendingEmail[]> {
  const next = nextTurn(record.toolId, record.payload)

  return next
    ? notifySignatureNeeded(transaction, actor, record, {
        label: next.label,
        signedBy: next.signedBy ?? [],
      })
    : []
}

// A signature signed in turn is signed once the record is submitted, or, for
// a tool signed from a field, once the system fills it, only when every one
// before it is signed. The approving one is never signed by whoever
// submitted the record, as with Approve.
function assertTurn(current: ToolRecord, fieldKey: string, actor: string) {
  const turns = turnsOf(current.toolId)!
  const next = nextTurn(current.toolId, current.payload)
  const field = signatureField(current.toolId, fieldKey)!

  const onDraft = "from" in turns

  if (current.state === "draft" && !onDraft) {
    throw new RecordNotEditableError(
      `${field.label} is signed once the record is submitted`
    )
  }

  if (
    current.state === "draft" &&
    !turnsOpen(current.toolId, "draft", current.payload)
  ) {
    throw new RecordNotEditableError(`${field.label} is signed once it is sent`)
  }

  const signable = onDraft ? ["draft"] : ["submitted", "approved"]

  if (!signable.includes(current.state)) {
    throw new RecordNotEditableError(
      `A ${current.state} record cannot be signed`
    )
  }

  if (next?.key !== fieldKey) {
    throw new InvalidTransitionError(
      next
        ? `${field.label} is signed after ${next.label}`
        : `${field.label} is already signed`
    )
  }

  if (
    fieldKey === approvingTurn(current.toolId) &&
    current.submittedBy === actor
  ) {
    throw new SelfApprovalError(
      "The person who submitted this record cannot approve it"
    )
  }
}

// After a signature signed in turn: the approving one approves the record,
// the last one locks it, and otherwise whoever signs next is asked. The last
// signature of a tool signed from a field locks its draft straight away:
// nobody approves it.
async function afterTurn(
  transaction: Transaction,
  actor: string,
  record: ToolRecord,
  fieldKey: string,
  outbox: PendingEmail[]
): Promise<ToolRecord> {
  await clearSignatureNeeded(transaction, record.id)

  const approved =
    fieldKey === approvingTurn(record.toolId)
      ? await move(transaction, actor, record, "approved", outbox)
      : record

  if (nextTurn(approved.toolId, approved.payload)) {
    outbox.push(...(await askNextSignature(transaction, actor, approved)))

    return approved
  }

  if (approved.state === "draft") {
    return lockDraftIn(transaction, actor, approved.id, {}, outbox)
  }

  return move(transaction, actor, approved, "locked", outbox)
}

// Writes who signed and when into a signature field of a draft or submitted
// record. Only a person holding one of the roles the field names may sign,
// whatever access they have to the rest of the record. A tool signed in turn
// takes its signatures after submit, one after another (assertTurn).
export async function signField(
  database: Database,
  actor: string,
  recordId: string,
  fieldKey: string,
  transport?: Transport
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

  if (await haltedFor(database, record.projectId, record.toolId)) {
    throw new PermissionDeniedError(
      `Work is halted on this project, so ${record.toolId} cannot be signed`
    )
  }

  if (
    (
      await fieldsOff(database, record.projectId, record.toolId, record.payload)
    ).has(fieldKey)
  ) {
    throw new ValidationError([
      { field: fieldKey, message: "This project does not ask for it" },
    ])
  }

  const turns = turnsOf(record.toolId)
  const inTurn = turns?.order.includes(fieldKey) ?? false

  // The approving signature is an approval, so it needs the right to approve.
  if (approvingTurn(record.toolId) === fieldKey) {
    await assertMay(database, actor, record.projectId, record.toolId, "approve")
  }

  const outbox: PendingEmail[] = []

  const signed = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (inTurn) {
      assertTurn(current, fieldKey, actor)
    } else if (current.state !== "draft" && current.state !== "submitted") {
      throw new RecordNotEditableError(
        `A ${current.state} record cannot be signed`
      )
    }

    const payload = setBySigning(current.toolId, fieldKey, {
      ...current.payload,
      [fieldKey]: { signedBy: actor, signedAt: new Date().toISOString() },
    })

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

    return inTurn
      ? afterTurn(transaction, actor, updated!, fieldKey, outbox)
      : updated!
  })

  await sendNotificationEmails(database, outbox, transport)

  return signed
}

// Approves a submitted record and locks it in one transaction, since the next
// tool opens when this one is locked. The person who submitted it may not
// approve it, even when they also hold a role that approves: the check is on
// the person. Every signature field must be signed.
export async function approveRecord(
  database: Database,
  actor: string,
  recordId: string,
  transport?: Transport
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertMay(database, actor, record.projectId, record.toolId, "approve")

  const turns = turnsOf(record.toolId)

  const approves = approvingTurn(record.toolId)

  if (turns && approves) {
    const approving = signatureField(record.toolId, approves)!

    throw new InvalidTransitionError(
      `${record.toolId} is approved by signing ${approving.label}`
    )
  }

  const outbox: PendingEmail[] = []

  const locked = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "submitted") {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot be approved`
      )
    }

    // A review answered so that it sends the work back, such as D3.8 with
    // the funds short, is sent back instead.
    const tool = tools.getTool(current.toolId)

    if (tool && answersSendBack(tool, current.payload)) {
      throw new InvalidTransitionError(
        `${current.toolId} cannot be approved with ${tool.sendsBackTo!.field} ${tool.sendsBackTo!.is}: send it back`
      )
    }

    if (current.submittedBy === actor) {
      throw new SelfApprovalError(
        "The person who submitted this record cannot approve it"
      )
    }

    const approved = await move(transaction, actor, current, "approved", outbox)

    return move(transaction, actor, approved, "locked", outbox)
  })

  await sendNotificationEmails(database, outbox, transport)

  return locked
}

export class SendBackReasonError extends Error {}

// The approver returns a submitted record to its writer as a draft, saying
// why. The reason is kept on the audit line, and whoever submitted it is told
// on their dashboard. The payload stays as submitted, so the writer carries on
// from it. A review answered so that it sends earlier work back, such as
// D3.8 with the funds short, is locked instead, as this iteration, which
// reopens that work (`sendsBackTo`) with the reason.
export async function sendBackRecord(
  database: Database,
  actor: string,
  recordId: string,
  reason: string,
  transport?: Transport
): Promise<ToolRecord> {
  const said = reason.trim()

  if (said === "") {
    throw new SendBackReasonError("Say what needs changing")
  }

  const record = await loadRecord(database, recordId)

  await assertMay(database, actor, record.projectId, record.toolId, "approve")

  const outbox: PendingEmail[] = []

  const moved = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "submitted") {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot be sent back`
      )
    }

    const tool = tools.getTool(current.toolId)

    if (tool && answersSendBack(tool, current.payload)) {
      const approved = await move(
        transaction,
        actor,
        current,
        "approved",
        outbox
      )

      return move(transaction, actor, approved, "locked", outbox, said)
    }

    // A tool that keeps the approver's decision records it was sent back.
    const decided = await decisionValues(
      transaction,
      current,
      actor,
      "sendBack"
    )

    const payload = { ...current.payload, ...decided }

    const [returned] = await transaction
      .update(toolRecords)
      .set({
        state: "draft",
        updatedAt: nextUpdatedAt(current),
        ...(Object.keys(decided).length > 0 && { payload }),
      })
      .where(eq(toolRecords.id, recordId))
      .returning(columns)

    if (Object.keys(decided).length > 0) {
      await writeAudit(
        transaction,
        {
          recordId,
          projectId: current.projectId,
          actor,
          action: "updated",
          reason: "The approver's decision",
        },
        payloadChanges(current.payload, payload)
      )
    }

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "transitioned",
        reason: said,
      },
      [stateChange(current.state, "draft")]
    )

    await notifySentBack(transaction, actor, current, said)
    await clearSignatureNeeded(transaction, recordId)

    return returned!
  })

  await sendNotificationEmails(database, outbox, transport)

  return moved
}

// The person who submitted a record takes it back as a draft before anyone
// approves it, to fix it and submit it again. Nobody else may, and it is not a
// review, so the iteration stays the same. The audit line says who and when,
// with no reason, so the draft is not shown as sent back. The approvers'
// "waiting for your approval" notifications for it are marked read.
export async function withdrawRecord(
  database: Database,
  actor: string,
  recordId: string
): Promise<ToolRecord> {
  const record = await loadRecord(database, recordId)

  await assertMay(database, actor, record.projectId, record.toolId, "write")

  return database.transaction(async (transaction) => {
    await assertProjectActive(transaction, record.projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "submitted") {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot be withdrawn`
      )
    }

    if (current.submittedBy !== actor) {
      throw new PermissionDeniedError(
        "Only the person who submitted this record can withdraw it"
      )
    }

    const [returned] = await transaction
      .update(toolRecords)
      .set({ state: "draft", updatedAt: nextUpdatedAt(current) })
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
      [stateChange(current.state, "draft")]
    )

    await clearApprovalNeeded(transaction, recordId)
    await clearSignatureNeeded(transaction, recordId)

    return returned!
  })
}

// Why the record was last sent back, while it is still the draft that came
// back: once it is submitted again, the reason has been dealt with.
export async function sentBackReason(
  database: Pick<Database, "select">,
  record: { id: string; state: RecordState }
): Promise<string | null> {
  if (record.state !== "draft") {
    return null
  }

  const [line] = await database
    .select({ reason: auditLog.reason, newValue: auditLog.newValue })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.recordId, record.id),
        eq(auditLog.action, "transitioned"),
        eq(auditLog.field, "state")
      )
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1)

  return line?.newValue === "draft" && line.reason ? line.reason : null
}

// Locks a draft at once, with no one to approve it: D1.4 once its email has
// gone, and D1.1 the moment the client's form comes in. The draft takes the
// system's values, if any, and moves to approved and locked in the caller's
// transaction, so the next tools open as with any lock. Nobody submitted it,
// so the document control block names the project's writer as the one who
// prepared it. A record already locked is returned as it is, so a second call
// after a first that finished does no harm.
export async function lockDraftIn(
  transaction: Transaction,
  actor: string,
  recordId: string,
  systemValues: JsonObject = {},
  outbox: PendingEmail[] = []
): Promise<ToolRecord> {
  const current = await lockRecord(transaction, recordId)

  if (current.state === "locked") {
    return current
  }

  await assertProjectActive(transaction, current.projectId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      `A ${current.state} record cannot be locked straight away`
    )
  }

  const payload = { ...current.payload, ...systemValues }
  const now = new Date()

  const [approved] = await transaction
    .update(toolRecords)
    .set({
      state: "approved",
      payload,
      updatedAt: nextUpdatedAt(current),
      approvedBy: actor,
      approvedAt: now,
    })
    .where(eq(toolRecords.id, current.id))
    .returning(columns)

  if (!isDeepStrictEqual(payload, current.payload)) {
    await writeAudit(
      transaction,
      {
        recordId: current.id,
        projectId: current.projectId,
        actor,
        action: "updated",
        reason: "Filled in by the system",
      },
      payloadChanges(current.payload, payload)
    )
  }

  await writeAudit(
    transaction,
    {
      recordId: current.id,
      projectId: current.projectId,
      actor,
      action: "transitioned",
      reason: "Locked without approval",
    },
    [stateChange("draft", "approved")]
  )

  return move(transaction, actor, approved!, "locked", outbox)
}

// D1.4's Send, after the email has gone. The caller checks the permission.
export async function lockSentDraft(
  database: Database,
  actor: string,
  recordId: string,
  systemValues: JsonObject
): Promise<ToolRecord> {
  return database.transaction((transaction) =>
    lockDraftIn(transaction, actor, recordId, systemValues)
  )
}

// Writes system-filled values, such as D1.4's delivery status, inside the
// caller's transaction, with an audit line for each change. On a locked record
// (the default) the record stays locked: these fields are never typed, so
// locking does not freeze them. On a draft, such as D1.5 while the client
// chooses a time, a read-only table may be written too, and so may the
// fields named in `sentText`: text the person wrote that a send fills in, such
// as the date in D2.8's script once its invite goes. Any other field is
// refused. A null value removes the field.
export async function setSystemValues(
  transaction: Transaction,
  actor: string,
  recordId: string,
  systemValues: Record<string, JsonObject[string] | null>,
  reason: string,
  state: "locked" | "draft" = "locked",
  sentText: readonly string[] = []
): Promise<ToolRecord> {
  const current = await lockRecord(transaction, recordId)

  const systemFilled = new Set(
    (tools.getTool(current.toolId)?.fields ?? []).flatMap((field) =>
      field.systemFilled ||
      (state === "draft" && field.type === "table" && field.readOnly) ||
      (state === "draft" &&
        sentText.includes(field.key) &&
        (field.type === "text" || field.type === "longText"))
        ? [field.key]
        : []
    )
  )

  const refused = Object.keys(systemValues).filter(
    (key) => !systemFilled.has(key)
  )

  if (refused.length > 0) {
    throw new ValidationError(
      refused.map((field) => ({
        field,
        message: "Not filled in by the system, so it cannot be set here",
      }))
    )
  }

  if (current.state !== state) {
    throw new InvalidTransitionError(
      state === "locked"
        ? `A ${current.state} record has no system values to fill in yet`
        : `A ${current.state} record cannot be changed here`
    )
  }

  // A draft is still being worked on, so it follows the same gate as any
  // edit. A locked record keeps every value it was locked with.
  if (state === "draft") {
    await assertProjectActive(transaction, current.projectId)
  } else if (Object.values(systemValues).some((value) => value === null)) {
    throw new ValidationError(
      Object.entries(systemValues).flatMap(([field, value]) =>
        value === null
          ? [{ field, message: "A locked record's value cannot be removed" }]
          : []
      )
    )
  }

  const payload: JsonObject = { ...current.payload }

  for (const [key, value] of Object.entries(systemValues)) {
    if (value === null) {
      delete payload[key]
    } else {
      payload[key] = value
    }
  }

  const changes = payloadChanges(current.payload, payload)

  if (changes.length === 0) {
    return current
  }

  const [updated] = await transaction
    .update(toolRecords)
    .set({ payload, updatedAt: nextUpdatedAt(current) })
    .where(eq(toolRecords.id, current.id))
    .returning(columns)

  await writeAudit(
    transaction,
    {
      recordId: current.id,
      projectId: current.projectId,
      actor,
      action: "updated",
      reason,
    },
    changes
  )

  return updated!
}

const tableRows = z.array(z.record(z.string(), z.unknown())).catch([])

// The payload with the cells this signature sets (`setOnSign`), such as
// D2.14's "PM received this notice" set to Done as the PM signs.
function setBySigning(
  toolId: string,
  fieldKey: string,
  payload: JsonObject
): JsonObject {
  const next: JsonObject = { ...payload }

  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.type !== "table") {
      continue
    }

    for (const rule of field.setOnSign ?? []) {
      if (rule.signature !== fieldKey) {
        continue
      }

      const rows = tableRows.parse(next[field.key]).map((row) => ({ ...row }))

      while (rows.length <= rule.row) {
        rows.push({})
      }

      rows[rule.row]![rule.column] = rule.is

      // SAFETY: rows of cells read from the payload, one cell changed.
      next[field.key] = rows as JsonObject[]
    }
  }

  return next
}

// Keeps when the person whose turn it is to sign first opens the record,
// once it can be signed, in the field their signature names (`viewedAs`),
// such as the client opening D2.11 once it is sent. Anyone else's open, or
// a second one, changes nothing.
export async function recordViewed(
  database: Database,
  actor: string,
  recordId: string,
  now = new Date()
): Promise<boolean> {
  const record = await loadRecord(database, recordId)
  const next = nextTurn(record.toolId, record.payload)
  const viewedAs = next?.viewedAs

  if (
    !next ||
    !viewedAs ||
    record.state !== "draft" ||
    record.payload[viewedAs] !== undefined ||
    !turnsOpen(record.toolId, record.state, record.payload)
  ) {
    return false
  }

  const held = await rolesOn(database, actor, record.projectId)

  if (!(next.signedBy ?? []).some((role) => held.includes(role))) {
    return false
  }

  return database.transaction(async (transaction) => {
    const current = await lockRecord(transaction, recordId)

    if (
      current.payload[viewedAs] !== undefined ||
      nextTurn(current.toolId, current.payload)?.key !== next.key ||
      !turnsOpen(current.toolId, current.state, current.payload)
    ) {
      return false
    }

    await setSystemValues(
      transaction,
      actor,
      recordId,
      { [viewedAs]: now.toISOString() },
      `${next.label}: first opened by the signer`,
      "draft"
    )

    return true
  })
}
