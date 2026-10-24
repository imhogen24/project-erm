import { defineConfig } from "drizzle-kit"

import { migrationsSchema, migrationsTable } from "./db/migration-history"

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  migrations: { schema: migrationsSchema, table: migrationsTable },
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
