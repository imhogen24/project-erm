import { createDatabase } from "../../db"
import { createLocalWebsiteTables } from "../../db/website/local"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set")
}

const { hostname } = new URL(url)

if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  throw new Error(`Refusing to reset a database that is not local: ${hostname}`)
}

const database = createDatabase(url)

await database.pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE")

await database.pool.query("DROP SCHEMA IF EXISTS erm_migrations CASCADE")

await database.pool.query("DROP SCHEMA IF EXISTS public CASCADE")

await database.pool.query("CREATE SCHEMA public")

// The website owns these in production. Development gets empty local copies.
await createLocalWebsiteTables(database)

await database.pool.end()

console.log("erm_dev wiped.")
