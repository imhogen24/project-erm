import { and, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  changeRequests,
  toolRecords,
  type ChangeRequestStatus,
} from "@/db/schema"
import {
  changeRequestChange,
  stateChange,
  writeAudit,
  type Transaction,
} from "@/server/audit/audit"
import { assertCan, assertHoldsRole } from "@/server/permissions/permissions"
import {
  getRecord,
  lockRecord,
  type ToolRecord,
} from "@/server/records/records"
import { UnknownToolError } from "@/server/records/validate"
import { getTool, workbookNumber } from "@/server/tools/registry"

export type { ChangeRequestStatus }

export class ChangeRequestNotAllowedError extends Error {}

export class ChangeRequestNotFoundError extends Error {}

export class ChangeRequestReasonMissingError extends Error {}

export type ChangeRequest = {
  id: string
  projectId: string
  recordId: string
  reason: string
  requestedBy: string
  status: ChangeRequestStatus
  decidedBy: string | null
  decidedAt: Date | null
  rejectionReason: string | null
  appliedAt: Date | null
  createdAt: Date
}

export type Decision =
  { outcome: "approved" } | { outcome: "rejected"; reason: string }

// A request is open until it is rejected, or applied when the record it
// reopened is locked again.
const openStatuses: readonly ChangeRequestStatus[] = ["requested", "approved"]

const columns = {
  id: changeRequests.id,
  projectId: changeRequests.projectId,
  recordId: changeRequests.recordId,
  reason: changeRequests.reason,
  requestedBy: changeRequests.requestedBy,
  status: changeRequests.status,
  decidedBy: changeRequests.decidedBy,
  decidedAt: changeRequests.decidedAt,
  rejectionReason: changeRequests.rejectionReason,
  appliedAt: changeRequests.appliedAt,
  createdAt: changeRequests.createdAt,
}

// A tool's workbook comes from its definition.
function workbookOf(toolId: string): number {
  const tool = getTool(toolId)

  if (!tool) {
    throw new UnknownToolError(`${toolId} has no tool definition`)
  }

  return workbookNumber(tool)
}

function requireReason(reason: string, what: string): string {
  const trimmed = reason.trim()

  if (trimmed === "") {
    throw new ChangeRequestReasonMissingError(`${what} needs a reason`)
  }

  return trimmed
}

// Anyone who may write the record's tool may ask, but only for a locked record
// with no open request.
export async function requestChange(
  database: Database,
  actor: string,
  recordId: string,
  reason: string
): Promise<ChangeRequest> {
  const record = await getRecord(database, actor, recordId)

  await assertCan(database, actor, record.projectId, record.toolId, "write")

  const why = requireReason(reason, "A change request")

  return database.transaction(async (transaction) => {
    // Held until the end, so a second request waits and then sees this one.
    const current = await lockRecord(transaction, recordId)

    if (current.state !== "locked") {
      throw new ChangeRequestNotAllowedError(
        `A ${current.state} record can be changed without a change request`
      )
    }

    const [open] = await transaction
      .select({ id: changeRequests.id })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.recordId, recordId),
          inArray(changeRequests.status, openStatuses)
        )
      )
      .limit(1)

    if (open) {
      throw new ChangeRequestNotAllowedError(
        "This record already has an open change request"
      )
    }

    const [request] = await transaction
      .insert(changeRequests)
      .values({
        projectId: current.projectId,
        recordId,
        reason: why,
        requestedBy: actor,
      })
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId,
        projectId: current.projectId,
        actor,
        action: "change_requested",
      },
      [changeRequestChange(request!.id, null, "requested", why)]
    )

    return request!
  })
}

// Only the project's PM decides. Approving moves the record from locked back to
// draft; rejecting needs a reason and leaves the record locked.
export async function decideChange(
  database: Database,
  actor: string,
  requestId: string,
  decision: Decision
): Promise<ChangeRequest> {
  const [request] = await database
    .select(columns)
    .from(changeRequests)
    .where(eq(changeRequests.id, requestId))

  if (!request) {
    throw new ChangeRequestNotFoundError(
      `No change request with id ${requestId}`
    )
  }

  await assertHoldsRole(database, actor, request.projectId, "PM")

  const rejection =
    decision.outcome === "rejected"
      ? requireReason(decision.reason, "A rejection")
      : undefined

  return database.transaction(async (transaction) => {
    // The record is held first, as moving it does, then the request, so a
    // second decision waits and then sees this one.
    const record = await lockRecord(transaction, request.recordId)

    const [current] = await transaction
      .select({ status: changeRequests.status })
      .from(changeRequests)
      .where(eq(changeRequests.id, requestId))
      .for("update")

    if (current!.status !== "requested") {
      throw new ChangeRequestNotAllowedError(
        `This change request is already ${current!.status}`
      )
    }

    if (decision.outcome === "approved" && record.state !== "locked") {
      throw new ChangeRequestNotAllowedError(
        `The record is ${record.state} now, so there is nothing to unlock`
      )
    }

    const [decided] = await transaction
      .update(changeRequests)
      .set({
        status: decision.outcome,
        decidedBy: actor,
        decidedAt: new Date(),
        rejectionReason: rejection ?? null,
      })
      .where(eq(changeRequests.id, requestId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId: record.id,
        projectId: record.projectId,
        actor,
        action:
          decision.outcome === "approved"
            ? "change_approved"
            : "change_rejected",
      },
      [changeRequestChange(requestId, "requested", decision.outcome, rejection)]
    )

    if (decision.outcome === "approved") {
      await reopen(transaction, actor, record)
      await markLaterRecords(transaction, actor, record, requestId)
    }

    return decided!
  })
}

async function reopen(
  transaction: Transaction,
  actor: string,
  record: ToolRecord
): Promise<void> {
  await transaction
    .update(toolRecords)
    .set({ state: "draft", updatedAt: new Date() })
    .where(eq(toolRecords.id, record.id))

  await writeAudit(
    transaction,
    {
      recordId: record.id,
      projectId: record.projectId,
      actor,
      action: "transitioned",
    },
    [stateChange("locked", "draft")]
  )
}

// Records in later workbooks stay as they are, but each gets a line saying it
// was built on a record that is being changed.
async function markLaterRecords(
  transaction: Transaction,
  actor: string,
  record: ToolRecord,
  requestId: string
): Promise<void> {
  const workbook = workbookOf(record.toolId)

  const live = await transaction
    .select({ id: toolRecords.id, toolId: toolRecords.toolId })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, record.projectId),
        ne(toolRecords.state, "void")
      )
    )

  for (const later of live) {
    if (workbookOf(later.toolId) <= workbook) {
      continue
    }

    await writeAudit(
      transaction,
      {
        recordId: later.id,
        projectId: record.projectId,
        actor,
        action: "built_on_change",
      },
      [
        {
          field: "built_on_change",
          oldValue: null,
          newValue: { id: requestId, recordId: record.id },
        },
      ]
    )
  }
}
