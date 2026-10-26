import { and, asc, eq, inArray, ne } from "drizzle-orm"

import type { Database } from "@/db"
import {
  accessLog,
  people,
  personCompanyRoles,
  personProjectRoles,
  projects,
  type Role,
} from "@/db/schema"
import { qualificationsOf } from "@/server/company-roles/company-roles"
import { assertCompanyRole } from "@/server/permissions/permissions"

import {
  countedStatuses,
  limitFor,
  oneHolderRoles,
  workloadLimits,
} from "./limits"

export { workloadLimits }

export class NotQualifiedError extends Error {}

export class ProjectNotFoundError extends Error {}

export class RoleTakenError extends Error {}

export class WorkloadLimitError extends Error {}

type Assignment = { projectId: string; personId: string; role: Role }

export type Workload = { group: string; count: number; limit: number }

// `limit` is null for a role with no limit, which is never full.
export type Candidate = {
  personId: string
  name: string
  count: number
  limit: number | null
  full: boolean
}

// `someoneFree` is false when nobody qualified is below the limit, so the
// screen can show "short staffed".
export type AvailableStaff = { people: Candidate[]; someoneFree: boolean }

type Reader = Pick<Database, "select">

// The roles each of these people holds on projects that still take up a slot.
async function countedRoles(database: Reader, personIds: string[]) {
  if (personIds.length === 0) {
    return []
  }

  return database
    .select({
      personId: personProjectRoles.personId,
      projectId: personProjectRoles.projectId,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .innerJoin(projects, eq(projects.id, personProjectRoles.projectId))
    .where(
      and(
        inArray(personProjectRoles.personId, personIds),
        inArray(projects.status, [...countedStatuses])
      )
    )
}

// The projects the person is on in any of these roles. A person with two roles
// of one group on a project is on it once.
function projectsIn(
  rows: Awaited<ReturnType<typeof countedRoles>>,
  personId: string,
  roles: readonly Role[]
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.personId === personId && roles.includes(row.role))
      .map((row) => row.projectId)
  )
}

async function personOf(database: Reader, personId: string) {
  const [person] = await database
    .select({ name: people.name, email: people.email })
    .from(people)
    .where(eq(people.id, personId))

  return person
}

// How many projects the person is on in each group. Only a company-wide
// IT/Admin may ask, since it shows which projects a person works on.
export async function workloadOf(
  database: Database,
  actor: string,
  personId: string
): Promise<Workload[]> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const rows = await countedRoles(database, [personId])

  return workloadLimits.map((entry) => ({
    group: entry.group,
    count: projectsIn(rows, personId, entry.roles).size,
    limit: entry.limit,
  }))
}

// The people qualified for the role, each with how many projects they are on
// in its group, the freest first.
export async function availableStaff(
  database: Database,
  actor: string,
  role: Role
): Promise<AvailableStaff> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const qualified = await database
    .select({ personId: people.id, name: people.name })
    .from(personCompanyRoles)
    .innerJoin(people, eq(people.id, personCompanyRoles.personId))
    .where(
      and(
        eq(personCompanyRoles.role, role),
        ne(personCompanyRoles.role, "IT/Admin")
      )
    )
    .orderBy(asc(people.name), asc(people.id))

  const rows = await countedRoles(
    database,
    qualified.map((person) => person.personId)
  )

  const group = limitFor(role)
  const limit = group?.limit ?? null

  const candidates = qualified
    .map((person) => {
      const count = projectsIn(
        rows,
        person.personId,
        group?.roles ?? [role]
      ).size

      return { ...person, count, limit, full: limit !== null && count >= limit }
    })
    .sort((a, b) => a.count - b.count)

  return {
    people: candidates,
    someoneFree: candidates.some((candidate) => !candidate.full),
  }
}

// Gives a qualified person a role on a project, with an access log line in the
// same transaction. The person's row is held until the transaction ends, so
// two assignments of one person are counted one after the other and cannot
// both pass the limit. The project's row is held the same way, so two people
// cannot both become its PM. Assigning a role the person already holds there
// changes nothing.
export async function assignStaff(
  database: Database,
  actor: string,
  input: Assignment
): Promise<void> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const person = await personOf(database, input.personId)

  if (
    !person ||
    !(await qualificationsOf(database, input.personId)).includes(input.role)
  ) {
    throw new NotQualifiedError(
      `${person?.name ?? "This person"} is not qualified as ${input.role}`
    )
  }

  await database.transaction(async (transaction) => {
    await transaction
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, input.personId))
      .for("no key update")

    const [project] = await transaction
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for("no key update")

    if (!project) {
      throw new ProjectNotFoundError(`No project with id ${input.projectId}`)
    }

    const holders = await transaction
      .select({ personId: personProjectRoles.personId })
      .from(personProjectRoles)
      .where(
        and(
          eq(personProjectRoles.projectId, input.projectId),
          eq(personProjectRoles.role, input.role)
        )
      )

    if (holders.some((holder) => holder.personId === input.personId)) {
      return
    }

    if (oneHolderRoles.includes(input.role) && holders.length > 0) {
      throw new RoleTakenError(`This project already has a ${input.role}`)
    }

    const group = limitFor(input.role)

    if (group) {
      const rows = await countedRoles(transaction, [input.personId])
      const onProjects = projectsIn(rows, input.personId, group.roles)

      // A second role of the same group on a project it already counts does
      // not take another slot.
      if (!onProjects.has(input.projectId) && onProjects.size >= group.limit) {
        throw new WorkloadLimitError(
          `${person.name} is already on ${onProjects.size} ${group.group} projects, and the limit is ${group.limit}`
        )
      }
    }

    await transaction.insert(personProjectRoles).values({
      personId: input.personId,
      projectId: input.projectId,
      role: input.role,
    })

    await transaction.insert(accessLog).values({
      actorId: actor,
      action: "roles_added",
      personId: input.personId,
      email: person.email.toLowerCase(),
      projectId: input.projectId,
      roles: [input.role],
    })
  })
}

// Takes one role on one project away, with an access log line. The person's
// other roles and projects stay, and the records they wrote keep their name.
export async function unassignStaff(
  database: Database,
  actor: string,
  input: Assignment
): Promise<void> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const person = await personOf(database, input.personId)

  if (!person) {
    return
  }

  await database.transaction(async (transaction) => {
    const removed = await transaction
      .delete(personProjectRoles)
      .where(
        and(
          eq(personProjectRoles.personId, input.personId),
          eq(personProjectRoles.projectId, input.projectId),
          eq(personProjectRoles.role, input.role)
        )
      )
      .returning({ role: personProjectRoles.role })

    if (removed.length === 0) {
      return
    }

    await transaction.insert(accessLog).values({
      actorId: actor,
      action: "roles_removed",
      personId: input.personId,
      email: person.email.toLowerCase(),
      projectId: input.projectId,
      roles: [input.role],
    })
  })
}
