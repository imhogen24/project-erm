import { and, asc, desc, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"

import {
  personProjectRoles,
  projects,
  toolRecords,
  type RecordState,
  type Role,
} from "@/db/schema"

import {
  PermissionDeniedError,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"

import type { ToolDefinition } from "@/server/tools/define-tool"

export type ProjectSummary = { id: string; name: string; roles: Role[] }

// A void record never shows; a tool with only void records is not started.
export type ToolState = Exclude<RecordState, "void"> | "notStarted"

export type ProjectOverview = {
  id: string
  name: string
  tools: { toolId: string; name: string; workbook: string; state: ToolState }[]
}

// The projects this person holds at least one role on, sorted by name.
export async function listProjectsFor(
  database: Database,
  actor: string
): Promise<ProjectSummary[]> {
  const rows = await database
    .select({
      id: projects.id,
      name: projects.name,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .innerJoin(projects, eq(projects.id, personProjectRoles.projectId))
    .where(eq(personProjectRoles.personId, actor))
    .orderBy(asc(projects.name), asc(projects.id), asc(personProjectRoles.role))

  // One row per role, so a person with two roles on a project gives two rows.
  const byProject = new Map<string, ProjectSummary>()

  for (const row of rows) {
    const project = byProject.get(row.id)

    if (project) {
      project.roles.push(row.role)
    } else {
      byProject.set(row.id, { id: row.id, name: row.name, roles: [row.role] })
    }
  }

  return [...byProject.values()]
}

// The tools this person may read on the project, each with the state of its
// newest record. The caller passes the tools, since server/ must not import
// from workbooks/.
export async function getProjectOverview(
  database: Database,
  actor: string,
  projectId: string,
  tools: readonly ToolDefinition[]
): Promise<ProjectOverview> {
  const held = await rolesOn(database, actor, projectId)

  // A project that does not exist also has no roles, so both get the same
  // refusal and the answer never reveals which projects exist.
  if (held.length === 0) {
    throw new PermissionDeniedError("This person is not on this project")
  }

  const [project] = await database
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  const readable = tools.filter((tool) => roleAllows(held, tool.id, "read"))

  const records =
    readable.length === 0
      ? []
      : await database
          .select({ toolId: toolRecords.toolId, state: toolRecords.state })
          .from(toolRecords)
          .where(
            and(
              eq(toolRecords.projectId, projectId),
              inArray(
                toolRecords.toolId,
                readable.map((tool) => tool.id)
              )
            )
          )
          .orderBy(desc(toolRecords.createdAt), desc(toolRecords.id))

  // Newest first, so the first record seen for a tool is the one that counts.
  // Void records are kept only for reference after a workbook rollback.
  const newest = new Map<string, Exclude<RecordState, "void">>()

  for (const record of records) {
    if (record.state !== "void" && !newest.has(record.toolId)) {
      newest.set(record.toolId, record.state)
    }
  }

  return {
    id: project!.id,
    name: project!.name,
    tools: readable.map((tool) => ({
      toolId: tool.id,
      name: tool.name,
      workbook: tool.workbook,
      state: newest.get(tool.id) ?? "notStarted",
    })),
  }
}
