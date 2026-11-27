import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  accessLog,
  people,
  personCompanyRoles,
  personProjectRoles,
  projects,
  type JsonObject,
} from "@/db/schema"
import { engineeringRoles } from "@/lib/resource-request"
import { rosterEngineers } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { notifyAssigned, type PendingEmail } from "@/server/notifications/raise"
import { systemActor } from "@/server/system/system"
import { approvedRows } from "@/server/team/resource-request"

type Reader = Pick<Transaction, "select">

const notes = z
  .object({
    resources: z
      .array(
        z
          .object({ tool: z.string().trim().optional().catch(undefined) })
          .catch({})
      )
      .catch([]),
  })
  .catch({ resources: [] })

const signed = z
  .object({
    heSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ heSignature: undefined })

// Where D4.3 starts before the LE saves anything: 2.0 on one row per D4.2
// request row, with its Role Required, Total Days Requested and the engineer
// the HE settled on, and 3.0 on one row per D4.1 3.0 row naming a tool or
// machine. The LE can change every one.
export async function assignmentStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [request, technical] = await Promise.all([
    lockedPayload(database, projectId, "D4.2"),
    lockedPayload(database, projectId, "D4.1"),
  ])

  const roster = approvedRows(request).map(({ role, engineer, days }) => ({
    ...(role && { role }),
    ...(engineer && { engineer }),
    ...(days !== undefined && { days }),
  }))

  const provisioning = notes
    .parse(technical)
    .resources.flatMap(({ tool }) => (tool ? [{ asset: tool }] : []))

  return {
    ...(roster.length > 0 && { roster }),
    ...(provisioning.length > 0 && { provisioning }),
  }
}

// What 1.0 and 4.0 of D4.3 show, read live: the request ID, the PM, the
// project's name, and the day the HE signed as both Assignment Date and
// Date.
export async function assignmentValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], pm] = await Promise.all([
    database
      .select({ requestId: projects.requestId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId)),
    holderOf(database, projectId, "PM"),
  ])

  const signedAt = signed.parse(payload).heSignature?.signedAt

  return {
    requestId: project?.requestId ?? "",
    projectManager: pm,
    projectName: project?.name ?? "",
    ...(signedAt && {
      assignmentDate: signedAt.slice(0, 10),
      signedDate: signedAt.slice(0, 10),
    }),
  }
}

// As a D4.3 locks, each rostered engineer who holds no role on the project
// is given AE on it, with an access log line, and told in the app and by
// email (the returned emails), as when staff are assigned on the team page.
// The system acts, not the HE. A name that is not one engineer, such as two
// staff sharing it, is left for IT/Admin to assign by hand.
export async function joinRoster(
  transaction: Transaction,
  projectId: string,
  payload: JsonObject
): Promise<PendingEmail[]> {
  const names = rosterEngineers(payload)

  if (names.length === 0) {
    return []
  }

  const staff = await transaction
    .selectDistinct({
      id: people.id,
      name: people.name,
      email: people.email,
    })
    .from(people)
    .innerJoin(personCompanyRoles, eq(personCompanyRoles.personId, people.id))
    .where(
      and(
        inArray(people.name, names),
        inArray(personCompanyRoles.role, engineeringRoles)
      )
    )

  const engineers = names.flatMap((name) => {
    const matches = staff.filter((person) => person.name === name)

    return matches.length === 1 ? matches : []
  })

  if (engineers.length === 0) {
    return []
  }

  const onProject = new Set(
    (
      await transaction
        .select({ personId: personProjectRoles.personId })
        .from(personProjectRoles)
        .where(
          and(
            eq(personProjectRoles.projectId, projectId),
            inArray(
              personProjectRoles.personId,
              engineers.map((engineer) => engineer.id)
            )
          )
        )
    ).map((row) => row.personId)
  )

  const emails: PendingEmail[] = []

  for (const engineer of engineers) {
    if (onProject.has(engineer.id)) {
      continue
    }

    const added = await transaction
      .insert(personProjectRoles)
      .values({ personId: engineer.id, projectId, role: "AE" })
      .onConflictDoNothing()
      .returning({ personId: personProjectRoles.personId })

    if (added.length === 0) {
      continue
    }

    await transaction.insert(accessLog).values({
      actorId: systemActor,
      action: "roles_added",
      personId: engineer.id,
      email: engineer.email.toLowerCase(),
      projectId,
      roles: ["AE"],
    })

    emails.push(
      ...(await notifyAssigned(transaction, systemActor, {
        projectId,
        personId: engineer.id,
        role: "AE",
      }))
    )
  }

  return emails
}
