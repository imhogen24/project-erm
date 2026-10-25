import { createDatabase } from "./index"
import { people, systemPerson } from "./schema"

export function createTestDatabase() {
  const url = process.env.TEST_DATABASE_URL

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Run tests with `bun run test`."
    )
  }

  return createDatabase(url)
}

// Empties every table in the public schema so each test starts clean.
export async function resetTestData(
  database: ReturnType<typeof createTestDatabase>
) {
  const { rows } = await database.pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  )

  if (rows.length === 0) {
    return
  }

  const tables = rows.map((row) => `"${row.tablename}"`).join(", ")

  await database.pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

// resetTestData empties `people`, which takes the system person the
// migrations made with it. A test that acts as the system puts it back.
export async function restoreSystemPerson(
  database: ReturnType<typeof createTestDatabase>
) {
  await database
    .insert(people)
    .values({
      id: systemPerson.id,
      name: systemPerson.name,
      email: systemPerson.email,
    })
    .onConflictDoNothing()
}
