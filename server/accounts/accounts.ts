import { and, eq, isNotNull, sql } from "drizzle-orm"

import type { Database } from "@/db"
import {
  accessLog,
  intakeSubmissions,
  people,
  personProjectRoles,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { systemActor } from "@/server/system/system"

type Writer = Pick<Database, "select" | "insert">

// Makes the person Client on the project and writes the access log line.
// Nothing is written when they already are.
async function makeClient(
  database: Writer,
  person: { id: string; email: string },
  projectId: string
) {
  const added = await database
    .insert(personProjectRoles)
    .values({ personId: person.id, projectId, role: "Client" })
    .onConflictDoNothing()
    .returning({ role: personProjectRoles.role })

  if (added.length === 0) {
    return
  }

  await database.insert(accessLog).values({
    actorId: systemActor,
    action: "roles_added",
    personId: person.id,
    email: person.email.toLowerCase(),
    projectId,
    roles: ["Client"],
  })
}

// After a client confirms their email: every website request made with that
// email becomes theirs. Only a confirmed email is matched, so nobody gets a
// request by typing someone else's address.
export async function attachRequests(database: Database, personId: string) {
  await database.transaction((transaction) =>
    attachRequestsIn(transaction, personId)
  )
}

// The same, inside a transaction the caller already holds, such as accepting
// an invite.
export async function attachRequestsIn(
  transaction: Transaction,
  personId: string
) {
  const [person] = await transaction
    .select({ id: people.id, email: people.email })
    .from(people)
    .where(
      and(
        eq(people.id, personId),
        eq(people.accountType, "client"),
        eq(people.emailVerified, true)
      )
    )

  if (!person) {
    return
  }

  const requests = await transaction
    .select({ projectId: intakeSubmissions.projectId })
    .from(intakeSubmissions)
    .where(
      and(
        isNotNull(intakeSubmissions.projectId),
        sql`lower(trim(${intakeSubmissions.submission}->>'email')) = ${person.email.trim().toLowerCase()}`
      )
    )

  for (const { projectId } of requests) {
    // SAFETY: the query keeps only requests that became a project.
    await makeClient(transaction, person, projectId!)
  }
}

// When a website request becomes a project: a client who already confirmed
// the request's email is put on it.
export async function attachClientIn(
  transaction: Transaction,
  projectId: string,
  email: string
) {
  const [person] = await transaction
    .select({ id: people.id, email: people.email })
    .from(people)
    .where(
      and(
        sql`lower(${people.email}) = ${email.trim().toLowerCase()}`,
        eq(people.accountType, "client"),
        eq(people.emailVerified, true)
      )
    )

  if (person) {
    await makeClient(transaction, person, projectId)
  }
}
