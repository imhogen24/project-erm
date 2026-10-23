import { and, eq } from "drizzle-orm"

import type { Database } from "@/db"
import { personProjectRoles, type Role } from "@/db/schema"

import { accessRow, type Access, type Action } from "./matrix"

export type { Action }

export class PermissionDeniedError extends Error {}

const grants: Record<Access, readonly Action[]> = {
  RW: ["read", "write"],
  RO: ["read"],
  RA: ["read", "approve"],
}

// Any one of the roles is enough, so a person with several roles gets the union.
// A tool that is not in the table allows nothing.
export function roleAllows(
  roles: readonly Role[],
  toolId: string,
  action: Action
): boolean {
  const row = accessRow(toolId)

  if (!row) {
    return false
  }

  return roles.some((role) => {
    const access = row[role]

    return access !== undefined && grants[access].includes(action)
  })
}

// The roles a person holds on a project. Empty when they hold none, or the
// project does not exist.
export async function rolesOn(
  database: Database,
  actor: string,
  projectId: string
): Promise<Role[]> {
  const held = await database
    .select({ role: personProjectRoles.role })
    .from(personProjectRoles)
    .where(
      and(
        eq(personProjectRoles.personId, actor),
        eq(personProjectRoles.projectId, projectId)
      )
    )

  return held.map((row) => row.role)
}

export async function can(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string,
  action: Action
): Promise<boolean> {
  return roleAllows(await rolesOn(database, actor, projectId), toolId, action)
}

// For the few actions that belong to one role on the project rather than to a
// tool, such as a PM rolling back a workbook.
export async function assertHoldsRole(
  database: Database,
  actor: string,
  projectId: string,
  role: Role
): Promise<void> {
  if (!(await rolesOn(database, actor, projectId)).includes(role)) {
    throw new PermissionDeniedError(
      `Only the ${role} of this project may do this`
    )
  }
}

export async function assertCan(
  database: Database,
  actor: string,
  projectId: string,
  toolId: string,
  action: Action
): Promise<void> {
  if (!(await can(database, actor, projectId, toolId, action))) {
    throw new PermissionDeniedError(
      `This person may not ${action} ${toolId} on this project`
    )
  }
}
