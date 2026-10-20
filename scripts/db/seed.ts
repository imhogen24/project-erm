import { createDatabase } from "../../db"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set")
}

const database = createDatabase(url)

// Seed data is added as tables are added. Every step must be safe to run
// again, because `bun dev` runs this on each start.
console.log("No seed data yet.")

await database.pool.end()
