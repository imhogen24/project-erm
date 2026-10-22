import { seed, SEED_PASSWORD } from "./seed-users"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL is not set")
}

// Every step must be safe to run again, because `bun dev` runs this on each
// start. Sample data for a workbook is added here by the issue that needs it.
const created = await seed(url)

if (created.length === 0) {
  console.log("Seed users already exist.")
} else {
  console.log(`Added ${created.length} seed users on "Demo Project":`)
  console.table(
    created.map(({ role, email }) => ({ role, email, password: SEED_PASSWORD }))
  )
}
