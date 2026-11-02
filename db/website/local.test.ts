import { getTableConfig } from "drizzle-orm/pg-core"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { afterAll, describe, expect, it } from "vitest"

import { createDatabase } from "@/db"
import { migrationsSchema, migrationsTable } from "@/db/migration-history"
import { createTestDatabase } from "@/db/testing"

import { NotLocalDatabaseError, createLocalWebsiteTables } from "./local"
import { websiteTables } from "./schema"

const database = createTestDatabase()

afterAll(async () => {
  await database.pool.end()
})

const names = websiteTables.map((table) => getTableConfig(table).name)

async function existing(target = database) {
  const { rows } = await target.pool.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY tablename",
    [names]
  )

  return rows.map((row) => row.name)
}

describe("local website tables", () => {
  it("are created empty, and creating them again changes nothing", async () => {
    await database.pool.query(
      `DROP TABLE IF EXISTS ${names.map((name) => `"${name}"`).join(", ")}`
    )

    await createLocalWebsiteTables(database)
    await createLocalWebsiteTables(database)

    expect(await existing()).toEqual([...names].sort())

    for (const name of names) {
      const { rows } = await database.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${name}"`
      )

      expect(rows[0]!.count).toBe(0)
    }
  })

  it("have the columns of the read-only definitions", async () => {
    for (const table of websiteTables) {
      const config = getTableConfig(table)

      const { rows } = await database.pool.query<{ name: string }>(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [config.name]
      )

      expect(rows.map((row) => row.name).sort()).toEqual(
        config.columns.map((column) => column.name).sort()
      )
    }
  })

  it("are refused on a database that is not local", async () => {
    const remote = createDatabase("postgres://erm:erm@db.example.com:5432/erm")

    await expect(createLocalWebsiteTables(remote)).rejects.toThrow(
      NotLocalDatabaseError
    )

    await remote.pool.end()
  })
})

// The website owns its tables, so the ERM's migrations must never create them.
describe("ERM migrations", () => {
  it("do not create the website tables", async () => {
    const scratch = "erm_migrations_check"

    await database.pool.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`)
    await database.pool.query(`CREATE DATABASE ${scratch}`)

    const url = new URL(process.env.TEST_DATABASE_URL!)
    url.pathname = `/${scratch}`

    const empty = createDatabase(url.toString())

    try {
      await migrate(empty, {
        migrationsFolder: "./db/migrations",
        migrationsSchema,
        migrationsTable,
      })

      expect(await existing(empty)).toEqual([])
    } finally {
      await empty.pool.end()
      await database.pool.query(`DROP DATABASE ${scratch} WITH (FORCE)`)
    }
    // A fresh database runs every migration, which is slow under a full run.
  }, 60_000)
})
