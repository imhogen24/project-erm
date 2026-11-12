import { seed } from "./seed-users"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set")
}

// Every step must be safe to run again, because `bun dev` runs this on each
// start. Sample data for a workbook is added here by the issue that needs it.
await seed(url)

console.log("Test accounts and screens to check: docs/TEST_ACCOUNTS/_.md")
