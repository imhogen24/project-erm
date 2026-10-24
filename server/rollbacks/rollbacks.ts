import { and, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  projects,
  toolRecords,
  workbookRollbacks,
  type RecordState,
} from "@/db/schema"
import { stateChange, writeAudit } from "@/server/audit/audit"
import { assertHoldsRole } from "@/server/permissions/permissions"
import { ProjectNotActiveError } from "@/server/projects/projects"
import { UnknownToolError } from "@/server/records/validate"
import { getTool, workbookNumber } from "@/server/tools/registry"

export class RollbackNotAllowedError extends Error {}

export class RollbackReasonMissingError extends Error {}

type Rollback = {
  projectId: string
  toWorkbook: number
  reason: string
}

export type WorkbookRollback = {
  id: string
  projectId: string
  fromWorkbook: number
  toWorkbook: number
  reason: string
  approvedBy: string
  createdAt: Date
}

// Up to this workbook a project can go back to any earlier one. After it, only
// one step back.
const lastOpenJumpWorkbook = 4

// The states that go back to draft when their workbook reopens.
const reopenedStates: readonly RecordState[] = [
  "submitted",
  "approved",
  "locked",
]

// A tool's workbook comes from its definition. A record whose tool has none
// stops the rollback, since there is no telling which workbook it is in.
function workbookOfTool(toolId: string): number {
  const tool = getTool(toolId)

  if (!tool) {
    throw new UnknownToolError(`${toolId} has no tool definition`)
  }

  return workbookNumber(tool)
}

export function canRollBack(from: number, to: number): boolean {
  if (!Number.isInteger(to) || to < 1 || to >= from) {
    return false
  }

  return from <= lastOpenJumpWorkbook || to === from - 1
}

// Where a record ends up, or undefined when the rollback leaves it alone.
function stateAfterRollback(
  workbook: number,
  state: RecordState,
  toWorkbook: number
): RecordState | undefined {
  if (workbook > toWorkbook) {
    return "void"
  }

  if (workbook === toWorkbook && reopenedStates.includes(state)) {
    return "draft"
  }

  return undefined
}

// Reopens `toWorkbook` as draft and voids every workbook after it, all in one
// transaction. Only the project's PM can do it, and only with a reason.
export async function rollBackWorkbook(
  database: Database,
  actor: string,
  input: Rollback
): Promise<WorkbookRollback> {
  await assertHoldsRole(database, actor, input.projectId, "PM")

  const reason = input.reason.trim()

  if (reason === "") {
    throw new RollbackReasonMissingError("A rollback needs a reason")
  }

  return database.transaction(async (transaction) => {
    // Holds the project until the transaction ends, so a second rollback waits
    // and then sees what this one did. Creating records is not blocked.
    const [project] = await transaction
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for("no key update")

    // A rollback moves records, so a project that is not active refuses it.
    if (project!.status !== "active") {
      throw new ProjectNotActiveError(
        `This project is ${project!.status}, so its records are read only`
      )
    }

    const live = await transaction
      .select({
        id: toolRecords.id,
        toolId: toolRecords.toolId,
        state: toolRecords.state,
      })
      .from(toolRecords)
      .where(
        and(
          eq(toolRecords.projectId, input.projectId),
          ne(toolRecords.state, "void")
        )
      )
      .for("update")

    if (live.length === 0) {
      throw new RollbackNotAllowedError(
        "This project has no records to roll back"
      )
    }

    const current = Math.max(
      ...live.map((record) => workbookOfTool(record.toolId))
    )

    if (!canRollBack(current, input.toWorkbook)) {
      throw new RollbackNotAllowedError(
        `A project in workbook ${current} cannot roll back to workbook ${input.toWorkbook}`
      )
    }

    if (
      !live.some((record) => workbookOfTool(record.toolId) === input.toWorkbook)
    ) {
      throw new RollbackNotAllowedError(
        `Workbook ${input.toWorkbook} has no records to reopen`
      )
    }

    // Its created_at is the transaction's start time, which every audit line
    // below shares, so the lines a rollback wrote are the ones with its
    // project, its approver as actor, and its created_at.
    const [rollback] = await transaction
      .insert(workbookRollbacks)
      .values({
        projectId: input.projectId,
        fromWorkbook: current,
        toWorkbook: input.toWorkbook,
        reason,
        approvedBy: actor,
      })
      .returning()

    const changes: { id: string; from: RecordState; to: RecordState }[] = []

    for (const record of live) {
      const to = stateAfterRollback(
        workbookOfTool(record.toolId),
        record.state,
        input.toWorkbook
      )

      if (to) {
        changes.push({ id: record.id, from: record.state, to })
      }
    }

    for (const to of ["void", "draft"] as const) {
      const ids: string[] = []

      for (const change of changes) {
        if (change.to === to) {
          ids.push(change.id)
        }
      }

      if (ids.length > 0) {
        await transaction
          .update(toolRecords)
          .set({ state: to, updatedAt: new Date() })
          .where(inArray(toolRecords.id, ids))
      }
    }

    for (const change of changes) {
      await writeAudit(
        transaction,
        {
          recordId: change.id,
          projectId: input.projectId,
          actor,
          action: "transitioned",
        },
        [stateChange(change.from, change.to)]
      )
    }

    return rollback!
  })
}
