import { existsSync } from "node:fs"

import { migrate } from "drizzle-orm/node-postgres/migrator"

import { createDatabase } from "./db"
import { migrationsSchema, migrationsTable } from "./db/migration-history"

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Run tests with `bun run test`."
    )
  }

  const database = createDatabase(url)

  try {
    await database.pool.query("SELECT 1")
  } catch {
    await database.pool.end()
    throw new Error(
      "Cannot reach the test database. Run `bun dev` first, or `docker compose up -d --wait`."
    )
  }

  if (existsSync("./db/migrations")) {
    await migrate(database, {
      migrationsFolder: "./db/migrations",
      migrationsSchema,
      migrationsTable,
    })
  }

  await database.pool.end()
}
