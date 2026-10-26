import { eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import {
  people,
  personProjectRoles,
  projects,
  roles,
  toolRecords,
  type Role,
} from "@/db/schema"
import { accessRow, type Access } from "@/server/permissions/matrix"
import { getRecord } from "@/server/records/records"

import { departments } from "./departments"

// `role` and `department` are empty when the person no longer holds a fitting
// role on the project.
export type Signer = {
  personId: string
  name: string
  role: Role | null
  department: string | null
}

// The block at the top of every tool. It is worked out from the record, the
// project and the assignments, never stored and never written by anyone.
export type DocumentControl = {
  requestId: string
  preparedBy: Signer | null
  checkedBy: Signer | null
  startedAt: Date
  completedAt: Date | null
  durationSeconds: number | null
}

type Assigned = { personId: string; name: string; role: Role }

// The roles with this access to the tool, in the order of the role list.
function rolesWith(toolId: string, access: Access): Role[] {
  const row = accessRow(toolId) ?? {}

  return roles.filter((role) => row[role] === access)
}

function signer(personId: string, name: string, role: Role | null): Signer {
  return {
    personId,
    name,
    role,
    department: role === null ? null : departments[role],
  }
}

// The first of these roles, in their order, that the person holds on the
// project. The assignments come back in no fixed order, so they never decide.
function firstHeld(
  assigned: Assigned[],
  personId: string,
  fitting: readonly Role[]
): Role | undefined {
  const held = new Set(
    assigned.flatMap((entry) =>
      entry.personId === personId ? [entry.role] : []
    )
  )

  return fitting.find((role) => held.has(role))
}

// The one person assigned to any of these roles, with the first of them they
// hold, or undefined when there is nobody or more than one.
function onlyHolder(assigned: Assigned[], fitting: readonly Role[]) {
  const holders = assigned.filter((entry) => fitting.includes(entry.role))
  const ids = new Set(holders.map((entry) => entry.personId))

  if (ids.size !== 1) {
    return undefined
  }

  const { personId, name } = holders[0]!

  return signer(personId, name, firstHeld(assigned, personId, fitting) ?? null)
}

// A person who acted on the record, with the first of these roles they still
// hold on the project. Their name stays when they are no longer assigned.
function actedBy(
  assigned: Assigned[],
  names: Map<string, string>,
  personId: string,
  fitting: readonly Role[]
): Signer {
  return signer(
    personId,
    names.get(personId) ?? "",
    firstHeld(assigned, personId, fitting) ?? null
  )
}

// Who prepared and who checked, the request ID and the times. While a record
// is a draft, the preparer is the one person assigned to the tool's writing
// role, the Client aside; from submit on, the person who submitted. Until it
// is approved, the checker is the project's PM; from approval on, the person
// who approved. Reading it needs read access to the record.
export async function getDocumentControl(
  database: Database,
  actor: string,
  recordId: string
): Promise<DocumentControl> {
  const record = await getRecord(database, actor, recordId)

  const [project] = await database
    .select({ requestId: projects.requestId, startedAt: toolRecords.createdAt })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(eq(toolRecords.id, recordId))

  const assigned = await database
    .select({
      personId: personProjectRoles.personId,
      name: people.name,
      role: personProjectRoles.role,
    })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(eq(personProjectRoles.projectId, record.projectId))

  const actors = [record.submittedBy, record.approvedBy].filter(
    (id): id is string => id !== null
  )

  const names = new Map(
    actors.length === 0
      ? []
      : (
          await database
            .select({ id: people.id, name: people.name })
            .from(people)
            .where(inArray(people.id, actors))
        ).map((person) => [person.id, person.name])
  )

  const writers = rolesWith(record.toolId, "RW")
  const approvers = rolesWith(record.toolId, "RA")

  let preparedBy: Signer | null = null

  if (record.state !== "draft" && record.submittedBy) {
    preparedBy = actedBy(assigned, names, record.submittedBy, writers)
  } else {
    preparedBy =
      onlyHolder(
        assigned,
        writers.filter((role) => role !== "Client")
      ) ?? null
  }

  let checkedBy: Signer | null = null
  const approved = record.state === "approved" || record.state === "locked"

  if (approved && record.approvedBy) {
    checkedBy = actedBy(assigned, names, record.approvedBy, approvers)
  } else {
    checkedBy = onlyHolder(assigned, ["PM"]) ?? null
  }

  const startedAt = project!.startedAt
  const completedAt = record.state === "locked" ? record.lockedAt : null

  return {
    requestId: project!.requestId,
    preparedBy,
    checkedBy,
    startedAt,
    completedAt,
    durationSeconds:
      completedAt === null
        ? null
        : Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
  }
}
