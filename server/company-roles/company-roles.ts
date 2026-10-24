import { and, eq } from "drizzle-orm"

import type { Database } from "@/db"
import {
  accessLog,
  people,
  personCompanyRoles,
  roles as knownRoles,
  type Role,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { assertCompanyRole } from "@/server/permissions/permissions"

export class InvalidCompanyRoleError extends Error {}

export class LastItAdminError extends Error {}

// Any role can be held company-wide except Client, who is always tied to their
// own project.
export function assertCompanyWideRoles(held: readonly string[]) {
  if (held.length === 0) {
    throw new InvalidCompanyRoleError("Give at least one role")
  }

  for (const role of held) {
    if (!knownRoles.some((known) => known === role)) {
      throw new InvalidCompanyRoleError(`"${role}" is not a role`)
    }

    if (role === "Client") {
      throw new InvalidCompanyRoleError(
        "A Client is always tied to their own project"
      )
    }
  }
}

// Returns only the roles that were new, so the log never claims a change that
// did not happen.
export async function addCompanyRoles(
  transaction: Transaction,
  personId: string,
  held: readonly Role[]
): Promise<Role[]> {
  const added = await transaction
    .insert(personCompanyRoles)
    .values(held.map((role) => ({ personId, role })))
    .onConflictDoNothing()
    .returning({ role: personCompanyRoles.role })

  return added.map((row) => row.role)
}

async function emailOf(database: Database, personId: string) {
  const [person] = await database
    .select({ email: people.email })
    .from(people)
    .where(eq(people.id, personId))

  if (!person) {
    throw new InvalidCompanyRoleError(`No person with id ${personId}`)
  }

  return person.email
}

// Each change is written in one transaction with its access_log line, so a
// failed log line undoes the change. A company-wide line has no project.
export async function giveCompanyRoles(
  database: Database,
  actor: string,
  personId: string,
  held: Role[]
): Promise<void> {
  await assertCompanyRole(database, actor, "IT/Admin")
  assertCompanyWideRoles(held)

  const email = await emailOf(database, personId)

  await database.transaction(async (transaction) => {
    const added = await addCompanyRoles(transaction, personId, [
      ...new Set(held),
    ])

    if (added.length === 0) {
      return
    }

    await transaction.insert(accessLog).values({
      actorId: actor,
      action: "roles_added",
      personId,
      email,
      roles: added,
    })
  })
}

// Every permission check reads the roles fresh, so the removal counts from the
// next request on. The last company-wide IT/Admin is never removed, since
// nobody could give access after that.
export async function removeCompanyRole(
  database: Database,
  actor: string,
  personId: string,
  role: Role
): Promise<void> {
  await assertCompanyRole(database, actor, "IT/Admin")

  const email = await emailOf(database, personId)

  await database.transaction(async (transaction) => {
    if (role === "IT/Admin") {
      // Locking every IT/Admin row makes a second removal wait for this one,
      // so two IT/Admins removing each other cannot both get through.
      const admins = await transaction
        .select({ personId: personCompanyRoles.personId })
        .from(personCompanyRoles)
        .where(eq(personCompanyRoles.role, "IT/Admin"))
        .for("update")

      if (admins.length === 1 && admins[0]!.personId === personId) {
        throw new LastItAdminError(
          "The last company-wide IT/Admin cannot be removed"
        )
      }
    }

    const removed = await transaction
      .delete(personCompanyRoles)
      .where(
        and(
          eq(personCompanyRoles.personId, personId),
          eq(personCompanyRoles.role, role)
        )
      )
      .returning({ role: personCompanyRoles.role })

    if (removed.length === 0) {
      return
    }

    await transaction.insert(accessLog).values({
      actorId: actor,
      action: "roles_removed",
      personId,
      email,
      roles: [role],
    })
  })
}
