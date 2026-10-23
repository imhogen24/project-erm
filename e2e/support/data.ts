import { randomUUID } from "node:crypto"

import { expect, type Page } from "@playwright/test"
import { hashPassword } from "better-auth/crypto"

import { createDatabase } from "@/db"
import {
  accounts,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type RecordState,
  type Role,
} from "@/db/schema"

export const PASSWORD = "correct-horse-battery"

function connect() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set. Run with `bun run test:e2e`.")
  }

  return createDatabase(url)
}

// Each helper opens its own connection and closes it, so a test never holds one
// while the browser runs. Names carry a random tag, so tests never collide and
// can be run again against the same dev database.
async function withDatabase<T>(
  run: (database: ReturnType<typeof connect>) => Promise<T>
) {
  const database = connect()

  try {
    return await run(database)
  } finally {
    await database.pool.end()
  }
}

export function tag() {
  return randomUUID().slice(0, 8)
}

export async function makePerson(name = `Person ${tag()}`) {
  const email = `${tag()}-${tag()}@example.com`

  const id = await withDatabase(async (database) => {
    const [person] = await database
      .insert(people)
      .values({ name, email })
      .returning({ id: people.id })

    await database.insert(accounts).values({
      personId: person!.id,
      accountId: person!.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    })

    return person!.id
  })

  return { id, name, email }
}

export async function makeProject(name = `Project ${tag()}`) {
  const id = await withDatabase(async (database) => {
    const [project] = await database
      .insert(projects)
      .values({ name })
      .returning({ id: projects.id })

    return project!.id
  })

  return { id, name }
}

export async function giveRoles(
  personId: string,
  projectId: string,
  roles: Role[]
) {
  await withDatabase((database) =>
    database
      .insert(personProjectRoles)
      .values(roles.map((role) => ({ personId, projectId, role })))
  )
}

export async function addRecord(
  projectId: string,
  toolId: string,
  state: RecordState
) {
  await withDatabase((database) =>
    database.insert(toolRecords).values({ projectId, toolId, state })
  )
}

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)
}

export async function sidewaysScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
}
