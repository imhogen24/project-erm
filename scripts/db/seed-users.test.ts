import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"
import { createAuth } from "@/server/auth/auth"

import { seed } from "./seed-users"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const url = process.env.TEST_DATABASE_URL!

const EMAILS = [
  "client@example.com",
  "om@example.com",
  "pm@example.com",
  "le@example.com",
  "ae@example.com",
  "ld@example.com",
  "fo@example.com",
  "ca@example.com",
  "he@example.com",
  "po@example.com",
  "io@example.com",
  "ws@example.com",
  "t@example.com",
  "qa@example.com",
  "lfe@example.com",
  "lo@example.com",
  "cr@example.com",
  "it-admin@example.com",
  "mkt@example.com",
]

async function count(table: "people" | "projects" | "person_project_roles") {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

async function rolesOnDemoProject() {
  const { rows } = await database.pool.query<{ email: string; role: string }>(
    `SELECT people.email, person_project_roles.role
       FROM person_project_roles
       JOIN people ON people.id = person_project_roles.person_id
       JOIN projects ON projects.id = person_project_roles.project_id
      WHERE projects.name = 'Demo Project'
      ORDER BY people.email`
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("seeding an empty database", () => {
  it("adds one person per role, each holding only that role on Demo Project", async () => {
    await seed(url)

    expect(await count("projects")).toBe(1)
    expect(await count("people")).toBe(19)
    expect(await count("person_project_roles")).toBe(19)

    const held = await rolesOnDemoProject()

    expect(held).toContainEqual({ email: "pm@example.com", role: "PM" })
    expect(held).toContainEqual({
      email: "it-admin@example.com",
      role: "IT/Admin",
    })
    expect(held).toContainEqual({ email: "client@example.com", role: "Client" })
    expect(held.map((row) => row.email).sort()).toEqual([...EMAILS].sort())
  })

  it("returns every user it created", async () => {
    const created = await seed(url)

    expect(created).toHaveLength(19)
    expect(created).toContainEqual({ role: "QA", email: "qa@example.com" })
  })
})

describe("seeding again", () => {
  it("changes nothing and creates no one", async () => {
    await seed(url)

    const created = await seed(url)

    expect(created).toEqual([])
    expect(await count("projects")).toBe(1)
    expect(await count("people")).toBe(19)
    expect(await count("person_project_roles")).toBe(19)
  })

  it("adds back only a user who was deleted", async () => {
    await seed(url)

    await database.pool.query(
      "DELETE FROM people WHERE email = 'qa@example.com'"
    )

    const created = await seed(url)

    expect(created).toEqual([{ role: "QA", email: "qa@example.com" }])
    expect(await count("people")).toBe(19)
    expect(await count("person_project_roles")).toBe(19)
  })
})

describe("signing in as a seed user", () => {
  it("works for every role with the password `password`", async () => {
    await seed(url)

    for (const email of EMAILS) {
      const result = await auth.api.signInEmail({
        body: { email, password: "password" },
      })

      expect(result.user.email).toBe(email)
    }
  })
})

describe("seeding a database that is not local", () => {
  it("stops with a clear message and writes nothing", async () => {
    const remote = new URL(url)

    remote.hostname = "db.example.com"

    await expect(seed(remote.toString())).rejects.toThrow(/not local/)

    expect(await count("people")).toBe(0)
    expect(await count("projects")).toBe(0)
  })
})
