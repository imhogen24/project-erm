import { and, asc, desc, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import {
  people,
  personProjectRoles,
  projects,
  type Role,
  type ServiceTrack,
} from "@/db/schema"
import { assertCompanyRole } from "@/server/permissions/permissions"

import { countedStatuses } from "./limits"

export type ProjectSummary = {
  id: string
  requestId: string
  name: string
  serviceTrack: ServiceTrack
}

export type TeamlessProject = ProjectSummary & { missing: Role[] }

export type TeamMember = { personId: string; name: string; role: Role }

// The roles the assign screen forms a team from, in the order it shows them.
const teamRoles: readonly Role[] = ["PM", "OM", "LE", "AE", "FO"]

// A project is listed when it has no PM or no OM. Finance is shown as missing
// too, but does not put a project on the list.
const listedRoles: readonly Role[] = ["PM", "OM"]

const reportedRoles: readonly Role[] = ["PM", "OM", "FO"]

// The projects still running that need a PM or an OM, the newest first, each
// with the team roles it has nobody in. Only a company-wide IT/Admin may ask.
export async function projectsNeedingTeam(
  database: Database,
  actor: string
): Promise<TeamlessProject[]> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const running = await database
    .select({
      id: projects.id,
      requestId: projects.requestId,
      name: projects.name,
      serviceTrack: projects.serviceTrack,
    })
    .from(projects)
    .where(inArray(projects.status, [...countedStatuses]))
    .orderBy(desc(projects.createdAt), asc(projects.id))

  if (running.length === 0) {
    return []
  }

  const held = await database
    .select({
      projectId: personProjectRoles.projectId,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .where(
      and(
        inArray(
          personProjectRoles.projectId,
          running.map((project) => project.id)
        ),
        inArray(personProjectRoles.role, [...reportedRoles])
      )
    )

  return running
    .map((project) => {
      const roles = held
        .filter((row) => row.projectId === project.id)
        .map((row) => row.role)

      return {
        ...project,
        missing: reportedRoles.filter((role) => !roles.includes(role)),
      }
    })
    .filter((project) =>
      project.missing.some((role) => listedRoles.includes(role))
    )
}

// The project and the people on it in the team roles, PM first. Nothing when
// the project does not exist. Only a company-wide IT/Admin may ask.
export async function teamOf(
  database: Database,
  actor: string,
  projectId: string
): Promise<{ project: ProjectSummary; members: TeamMember[] } | undefined> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const [project] = await database
    .select({
      id: projects.id,
      requestId: projects.requestId,
      name: projects.name,
      serviceTrack: projects.serviceTrack,
    })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) {
    return undefined
  }

  const members = await database
    .select({
      personId: people.id,
      name: people.name,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        inArray(personProjectRoles.role, [...teamRoles])
      )
    )
    .orderBy(asc(people.name), asc(people.id))

  return {
    project,
    members: members.sort(
      (a, b) => teamRoles.indexOf(a.role) - teamRoles.indexOf(b.role)
    ),
  }
}
