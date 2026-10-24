import { existsSync } from "node:fs"

import { migrate } from "drizzle-orm/node-postgres/migrator"

import { createDatabase } from "../../db"
import { migrationsSchema, migrationsTable } from "../../db/migration-history"

const migrationsFolder = "./db/migrations"

const url = process.argv[2] ?? process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set")
}

if (!existsSync(migrationsFolder)) {
  console.log("No migrations yet, nothing to apply.")
  process.exit(0)
}

const database = createDatabase(url)

await migrate(database, { migrationsFolder, migrationsSchema, migrationsTable })

await database.pool.end()

console.log("Migrations applied.")
