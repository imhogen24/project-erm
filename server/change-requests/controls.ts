import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  changeRequests,
  people,
  toolRecords,
  type RecordState,
} from "@/db/schema"
import {
  PermissionDeniedError,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"
import { getTool } from "@/server/tools/registry"

import type { ChangeRequestStatus } from "./change-requests"

export type OpenRequest = {
  id: string
  recordId: string
  toolId: string
  toolName: string
  reason: string
  requestedBy: string
  createdAt: Date
}

export type RecordControl = {
  toolId: string
  recordId: string
  state: Exclude<RecordState, "void">
  // Whether this person may ask for a change on the record right now.
  canRequest: boolean
  // The request still open on the record, if there is one.
  request?: { id: string; status: ChangeRequestStatus }
}

export type ChangeControls = {
  isPm: boolean
  records: RecordControl[]
  // The requests waiting for a decision. Only the project's PM gets them.
  waiting: OpenRequest[]
}

// A request is open until it is rejected, or applied when its record is locked
// again.
const openStatuses: readonly ChangeRequestStatus[] = ["requested", "approved"]

// What the project overview needs to draw the change request controls for one
// person: what they may do with each tool's newest record, and for the
// project's PM the requests waiting for a decision.
export async function changeControlsFor(
  database: Database,
  actor: string,
  projectId: string
): Promise<ChangeControls> {
  const held = await rolesOn(database, actor, projectId)

  if (held.length === 0) {
    throw new PermissionDeniedError("This person is not on this project")
  }

  const records = await database
    .select({
      id: toolRecords.id,
      toolId: toolRecords.toolId,
      state: toolRecords.state,
    })
    .from(toolRecords)
    .where(
      and(eq(toolRecords.projectId, projectId), ne(toolRecords.state, "void"))
    )
    .orderBy(desc(toolRecords.createdAt), desc(toolRecords.id))

  const open = await database
    .select({
      id: changeRequests.id,
      recordId: changeRequests.recordId,
      status: changeRequests.status,
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.projectId, projectId),
        inArray(changeRequests.status, [...openStatuses])
      )
    )

  // Newest first, so the first record seen for a tool is the one that counts.
  const newest = new Map<string, RecordControl>()

  for (const record of records) {
    if (
      record.state === "void" ||
      newest.has(record.toolId) ||
      !roleAllows(held, record.toolId, "read")
    ) {
      continue
    }

    const request = open.find((each) => each.recordId === record.id)

    newest.set(record.toolId, {
      toolId: record.toolId,
      recordId: record.id,
      state: record.state,
      canRequest:
        record.state === "locked" &&
        request === undefined &&
        roleAllows(held, record.toolId, "write"),
      ...(request && { request: { id: request.id, status: request.status } }),
    })
  }

  const isPm = held.includes("PM")

  return {
    isPm,
    records: [...newest.values()],
    waiting: isPm ? await waitingFor(database, projectId, held) : [],
  }
}

async function waitingFor(
  database: Database,
  projectId: string,
  held: Parameters<typeof roleAllows>[0]
): Promise<OpenRequest[]> {
  const rows = await database
    .select({
      id: changeRequests.id,
      recordId: changeRequests.recordId,
      toolId: toolRecords.toolId,
      reason: changeRequests.reason,
      requestedBy: people.name,
      createdAt: changeRequests.createdAt,
    })
    .from(changeRequests)
    .innerJoin(toolRecords, eq(toolRecords.id, changeRequests.recordId))
    .innerJoin(people, eq(people.id, changeRequests.requestedBy))
    .where(
      and(
        eq(changeRequests.projectId, projectId),
        eq(changeRequests.status, "requested")
      )
    )
    .orderBy(asc(changeRequests.createdAt), asc(changeRequests.id))

  return rows
    .filter((row) => roleAllows(held, row.toolId, "read"))
    .map((row) => ({
      ...row,
      toolName: getTool(row.toolId)?.name ?? row.toolId,
    }))
}
