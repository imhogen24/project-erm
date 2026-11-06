import { removeE2eData } from "@/db/e2e-data"

async function clean(when: string) {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.warn("Test data was not cleaned: DATABASE_URL is not set.")

    return
  }

  try {
    const removed = await removeE2eData(url)

    if (removed.projects + removed.people > 0) {
      console.log(
        `Removed ${removed.projects} test projects and ${removed.people} test people ${when}.`
      )
    }
  } catch (error) {
    // A failed clean-up never hides the result of the tests.
    console.warn(
      `Test data was not cleaned ${when}: ${error instanceof Error ? error.message : "unknown error"}`
    )
  }
}

// Runs before the tests, so a run that was stopped halfway leaves nothing
// behind, and returns what runs after them, pass or fail. Without this the
// tests pile up projects, and a page that lists them all slows past the tests'
// time limits.
export default async function globalSetup() {
  await clean("left from an earlier run")

  return async () => {
    await clean("made by this run")
  }
}
