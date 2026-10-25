import { DrizzleQueryError, and, asc, desc, eq, inArray } from "drizzle-orm"
import { DatabaseError } from "pg"

import type { Database } from "@/db"

import {
  personProjectRoles,
  projectStatuses,
  projects,
  roles,
  serviceTracks,
  toolRecords,
  type ProjectStatus,
  type RecordState,
  type Role,
  type ServiceTrack,
} from "@/db/schema"

import { writeAudit, type Transaction } from "@/server/audit/audit"

import {
  PermissionDeniedError,
  assertHoldsRole,
  companyRolesOf,
  roleAllows,
  rolesOn,
} from "@/server/permissions/permissions"

import type { ToolDefinition } from "@/server/tools/define-tool"

export { projectStatuses, serviceTracks }

export type { ProjectStatus, ServiceTrack }

export class DuplicateRequestIdError extends Error {}

export class InvalidServiceTrackError extends Error {}

export class InvalidProjectStatusError extends Error {}

export class ProjectNotActiveError extends Error {}

export class ProjectStatusReasonMissingError extends Error {}

export type Project = {
  id: string
  name: string
  requestId: string
  serviceTrack: ServiceTrack
  status: ProjectStatus
}

export type ProjectSummary = Project & { roles: Role[] }

// A void record never shows; a tool with only void records is not started.
export type ToolState = Exclude<RecordState, "void"> | "notStarted"

export type ProjectOverview = Project & {
  tools: { toolId: string; name: string; workbook: string; state: ToolState }[]
}

type NewProject = {
  name: string
  serviceTrack: ServiceTrack
  requestId: string
}

const columns = {
  id: projects.id,
  name: projects.name,
  requestId: projects.requestId,
  serviceTrack: projects.serviceTrack,
  status: projects.status,
}

// The request ID is the website's, so the client and the team quote the same
// one. The unique rule on the column refuses a second project with it, even
// when both are created at the same moment. A new project is active.
export async function createProject(
  database: Database,
  actor: string,
  input: NewProject
): Promise<Project> {
  if (!serviceTracks.includes(input.serviceTrack)) {
    throw new InvalidServiceTrackError(
      `A project needs a service track: ${serviceTracks.join(" or ")}`
    )
  }

  try {
    return await database.transaction(async (transaction) => {
      const [project] = await transaction
        .insert(projects)
        .values({
          name: input.name,
          requestId: input.requestId,
          serviceTrack: input.serviceTrack,
        })
        .returning(columns)

      await writeAudit(
        transaction,
        {
          recordId: null,
          projectId: project!.id,
          actor,
          action: "created",
        },
        [
          { field: "name", oldValue: null, newValue: project!.name },
          { field: "request_id", oldValue: null, newValue: project!.requestId },
          {
            field: "service_track",
            oldValue: null,
            newValue: project!.serviceTrack,
          },
          { field: "status", oldValue: null, newValue: project!.status },
        ]
      )

      return project!
    })
  } catch (error) {
    // Drizzle wraps the driver's error, so the broken rule is on its cause.
    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof DatabaseError &&
      error.cause.constraint === "projects_request_id_unique"
    ) {
      throw new DuplicateRequestIdError(
        `Request ID ${input.requestId} is already used by another project`
      )
    }

    throw error
  }
}

// Only the project's PM can do it for now, and only with a reason. The row is
// held until the transaction ends, so records being created or moved finish
// first, and none start until the new status is saved.
export async function setProjectStatus(
  database: Database,
  actor: string,
  projectId: string,
  status: ProjectStatus,
  reason: string
): Promise<Project> {
  await assertHoldsRole(database, actor, projectId, "PM")

  const trimmed = reason.trim()

  if (trimmed === "") {
    throw new ProjectStatusReasonMissingError("A status change needs a reason")
  }

  if (!projectStatuses.includes(status)) {
    throw new InvalidProjectStatusError(`${status} is not a project status`)
  }

  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")

    if (current!.status === status) {
      throw new InvalidProjectStatusError(`This project is already ${status}`)
    }

    const [updated] = await transaction
      .update(projects)
      .set({ status })
      .where(eq(projects.id, projectId))
      .returning(columns)

    await writeAudit(
      transaction,
      {
        recordId: null,
        projectId,
        actor,
        action: "transitioned",
        reason: trimmed,
      },
      [{ field: "status", oldValue: current!.status, newValue: status }]
    )

    return updated!
  })
}

// Runs inside the transaction that creates or moves records, after the
// permission check has confirmed the project exists. The key share lock waits
// for a status change in progress and holds one off until the transaction
// ends, without blocking other records or a rollback.
export async function assertProjectActive(
  transaction: Transaction,
  projectId: string
): Promise<void> {
  const [project] = await transaction
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("key share")

  if (project!.status !== "active") {
    throw new ProjectNotActiveError(
      `This project is ${project!.status}, so its records are read only`
    )
  }
}

// The projects this person holds at least one role on, sorted by name. A
// company-wide IT/Admin holds it on every project, so they see every project,
// with their project roles added. A qualification adds no project.
export async function listProjectsFor(
  database: Database,
  actor: string
): Promise<ProjectSummary[]> {
  const [rows, companyWide] = await Promise.all([
    database
      .select({ ...columns, role: personProjectRoles.role })
      .from(personProjectRoles)
      .innerJoin(projects, eq(projects.id, personProjectRoles.projectId))
      .where(eq(personProjectRoles.personId, actor))
      .orderBy(
        asc(projects.name),
        asc(projects.id),
        asc(personProjectRoles.role)
      ),
    companyRolesOf(database, actor),
  ])

  // One row per role, so a person with two roles on a project gives two rows.
  const byProject = new Map<string, ProjectSummary>()

  for (const { role, ...row } of rows) {
    const project = byProject.get(row.id)

    if (project) {
      project.roles.push(role)
    } else {
      byProject.set(row.id, { ...row, roles: [role] })
    }
  }

  if (!companyWide.includes("IT/Admin")) {
    return [...byProject.values()]
  }

  const every = await database
    .select(columns)
    .from(projects)
    .orderBy(asc(projects.name), asc(projects.id))

  return every.map((project) => {
    const held = new Set<Role>([
      "IT/Admin",
      ...(byProject.get(project.id)?.roles ?? []),
    ])

    return { ...project, roles: roles.filter((role) => held.has(role)) }
  })
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
    .select(columns)
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
    ...project!,
    tools: readable.map((tool) => ({
      toolId: tool.id,
      name: tool.name,
      workbook: tool.workbook,
      state: newest.get(tool.id) ?? "notStarted",
    })),
  }
}
