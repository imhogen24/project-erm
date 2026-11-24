import { and, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import { personProjectRoles, projects, toolRecords } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { nextTurn } from "./signatures"

// The tools signed in turn whose next signature is this person's to give, by
// project, for their dashboard: the client signing T3.D2.2a, for example. A
// project that is not active waits for nobody. Whoever submitted a record is
// never waited on for its approving signature.
export async function signaturesWaitingFor(
  database: Database,
  personId: string
): Promise<Map<string, string[]>> {
  const signedInTurn = tools
    .listTools()
    .filter((tool) => tool.signInTurn)
    .map((tool) => tool.id)

  if (signedInTurn.length === 0) {
    return new Map()
  }

  const rows = await database
    .select({
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      payload: toolRecords.payload,
      submittedBy: toolRecords.submittedBy,
      role: personProjectRoles.role,
    })
    .from(toolRecords)
    .innerJoin(
      personProjectRoles,
      eq(personProjectRoles.projectId, toolRecords.projectId)
    )
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(
      and(
        eq(personProjectRoles.personId, personId),
        eq(projects.status, "active"),
        inArray(toolRecords.toolId, signedInTurn),
        inArray(toolRecords.state, ["submitted", "approved"])
      )
    )

  const waiting = new Map<string, string[]>()

  for (const row of rows) {
    const next = nextTurn(row.toolId, row.payload)
    const turns = tools.getTool(row.toolId)?.signInTurn

    const mine =
      next !== undefined &&
      (next.signedBy ?? []).includes(row.role) &&
      !(next.key === turns?.approves && row.submittedBy === personId)

    const listed = waiting.get(row.projectId) ?? []

    if (mine && !listed.includes(row.toolId)) {
      waiting.set(row.projectId, [...listed, row.toolId])
    }
  }

  return waiting
}
