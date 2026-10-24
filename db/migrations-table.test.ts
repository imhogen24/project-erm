import { readFileSync } from "node:fs"

import { afterAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { createTestDatabase } from "./testing"

const database = createTestDatabase()

afterAll(async () => {
  await database.pool.end()
})

// The website shares the production database and keeps its own history in
// drizzle.__drizzle_migrations. Drizzle only compares timestamps in that table,
// so sharing it could make either app skip the other's migrations.
describe("migration history", () => {
  it("is kept in the erm_migrations schema, one row per migration", async () => {
    const journal = z
      .object({ entries: z.array(z.unknown()) })
      .parse(
        JSON.parse(readFileSync("./db/migrations/meta/_journal.json", "utf8"))
      )

    const { rows } = await database.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM erm_migrations.__drizzle_migrations"
    )

    expect(rows[0]!.count).toBe(journal.entries.length)
  })

  it("leaves the drizzle schema to the other app", async () => {
    const { rows } = await database.pool.query<{ found: string | null }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS found"
    )

    expect(rows[0]!.found).toBeNull()
  })
})
