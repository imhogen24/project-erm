import { hashPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"

import { createDatabase, type Database } from "@/db"
import {
  accounts,
  people,
  personProjectRoles,
  projects,
  roles,
  type Role,
} from "@/db/schema"

export type SeedUser = { role: Role; email: string }

export const SEED_PASSWORD = "password"

const PROJECT_NAME = "Demo Project"

// "IT/Admin" becomes "it-admin@example.com".
export function seedEmail(role: Role) {
  return `${role.toLowerCase().replace("/", "-")}@example.com`
}

function assertLocal(url: string) {
  const { hostname } = new URL(url)

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to seed a database that is not local: ${hostname}`
    )
  }
}

async function findOrCreateProject(database: Database) {
  const [existing] = await database
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, PROJECT_NAME))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [created] = await database
    .insert(projects)
    .values({ name: PROJECT_NAME })
    .returning({ id: projects.id })

  return created!.id
}

// Each person is checked before adding, so running this again changes nothing
// and only what is missing is added back. A password already set is kept.
// Returns whether the person was new.
async function addPerson(
  database: Database,
  projectId: string,
  role: Role,
  passwordHash: string
) {
  const email = seedEmail(role)

  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, email))
      .limit(1)

    let personId = existing?.id

    if (!personId) {
      const [person] = await transaction
        .insert(people)
        .values({ name: `Demo ${role}`, email, emailVerified: true })
        .returning({ id: people.id })

      personId = person!.id
    }

    const [account] = await transaction
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(
        and(
          eq(accounts.personId, personId),
          eq(accounts.providerId, "credential")
        )
      )
      .limit(1)

    if (!account) {
      await transaction.insert(accounts).values({
        personId,
        accountId: personId,
        providerId: "credential",
        password: passwordHash,
      })
    } else if (!account.password) {
      await transaction
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, account.id))
    }

    await transaction
      .insert(personProjectRoles)
      .values({ personId, projectId, role })
      .onConflictDoNothing()

    return !existing
  })
}

// Local development only: one person per role on "Demo Project", all with the
// password `password`. Returns the people this run added.
export async function seed(url: string): Promise<SeedUser[]> {
  assertLocal(url)

  const database = createDatabase(url)

  try {
    const projectId = await findOrCreateProject(database)
    const passwordHash = await hashPassword(SEED_PASSWORD)
    const created: SeedUser[] = []

    for (const role of roles) {
      if (await addPerson(database, projectId, role, passwordHash)) {
        created.push({ role, email: seedEmail(role) })
      }
    }

    return created
  } finally {
    await database.pool.end()
  }
}
