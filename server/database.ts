import { createDatabase } from "@/db"

let database: ReturnType<typeof createDatabase> | undefined

export function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

// Built on first use, so a build that never reads the database needs no URL.
export function getDatabase() {
  database ??= createDatabase(requireEnv("DATABASE_URL"))

  return database
}
