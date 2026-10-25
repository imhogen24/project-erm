import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"
import { createAuth } from "@/server/auth/auth"
import { listProjectsFor } from "@/server/projects/projects"

import { DEMO_REQUEST_ID, seed } from "./seed-users"

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

const COMPANY_WIDE = [
  { email: "fo@example.com", role: "FO" },
  { email: "he@example.com", role: "HE" },
  { email: "it-admin@example.com", role: "IT/Admin" },
  { email: "om@example.com", role: "OM" },
  { email: "pm@example.com", role: "PM" },
]

const QUALIFIED = [
  "fo@example.com",
  "he@example.com",
  "om@example.com",
  "pm@example.com",
]

async function count(
  table: "people" | "projects" | "person_project_roles" | "person_company_roles"
) {
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

async function companyWideRoles() {
  const { rows } = await database.pool.query<{ email: string; role: string }>(
    `SELECT people.email, person_company_roles.role
       FROM person_company_roles
       JOIN people ON people.id = person_company_roles.person_id
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

async function idOf(email: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM people WHERE email = $1",
    [email]
  )

  return rows[0]!.id
}

async function projectsSeenBy(email: string) {
  const listed = await listProjectsFor(database, await idOf(email))

  return listed.map((project) => project.name)
}

describe("seeding an empty database", () => {
  it("adds one person per role, each but IT/Admin holding only that role on Demo Project", async () => {
    await seed(url)

    expect(await count("projects")).toBe(1)
    expect(await count("people")).toBe(19)
    expect(await count("person_project_roles")).toBe(18)

    const held = await rolesOnDemoProject()

    expect(held).toContainEqual({ email: "le@example.com", role: "LE" })
    expect(held).toContainEqual({ email: "pm@example.com", role: "PM" })
    expect(held).toContainEqual({ email: "client@example.com", role: "Client" })
    expect(held.map((row) => row.email).sort()).toEqual(
      EMAILS.filter((email) => email !== "it-admin@example.com").sort()
    )
  })

  it("qualifies the OM, PM, HE and FO users and gives IT/Admin company-wide", async () => {
    await seed(url)

    expect(await companyWideRoles()).toEqual(COMPANY_WIDE)
  })

  it("shows the OM, PM, HE and FO users only Demo Project, and IT/Admin every project", async () => {
    await seed(url)

    await database.pool.query(
      "INSERT INTO projects (name, request_id, service_track) VALUES ('Other Project', 'T1-1', 'Tier_1')"
    )

    for (const email of QUALIFIED) {
      expect(await projectsSeenBy(email)).toEqual(["Demo Project"])
    }

    expect(await projectsSeenBy("it-admin@example.com")).toEqual([
      "Demo Project",
      "Other Project",
    ])
  })

  it("gives Demo Project a request ID and a service track, and leaves it active", async () => {
    await seed(url)

    const { rows } = await database.pool.query(
      "SELECT request_id, service_track, status FROM projects WHERE name = 'Demo Project'"
    )

    expect(rows).toEqual([
      {
        request_id: DEMO_REQUEST_ID,
        service_track: "Tier_1",
        status: "active",
      },
    ])
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
    expect(await count("person_project_roles")).toBe(18)
    expect(await count("person_company_roles")).toBe(5)
  })

  it("adds back only a user who was deleted", async () => {
    await seed(url)

    await database.pool.query(
      "DELETE FROM people WHERE email = 'qa@example.com'"
    )

    const created = await seed(url)

    expect(created).toEqual([{ role: "QA", email: "qa@example.com" }])
    expect(await count("people")).toBe(19)
    expect(await count("person_project_roles")).toBe(18)
    expect(await count("person_company_roles")).toBe(5)
  })
})

describe("seeding a user who lost their password or role", () => {
  it("gives them back without adding a second person", async () => {
    await seed(url)

    await database.pool.query(
      "DELETE FROM accounts WHERE person_id = (SELECT id FROM people WHERE email = 'qa@example.com')"
    )
    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = (SELECT id FROM people WHERE email = 'qa@example.com')"
    )

    const created = await seed(url)

    expect(created).toEqual([])
    expect(await count("people")).toBe(19)
    expect(await rolesOnDemoProject()).toContainEqual({
      email: "qa@example.com",
      role: "QA",
    })

    const result = await auth.api.signInEmail({
      body: { email: "qa@example.com", password: "password" },
    })

    expect(result.user.email).toBe("qa@example.com")
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

describe("seeding a user who lost a qualification", () => {
  it("gives it back", async () => {
    await seed(url)

    await database.pool.query(
      "DELETE FROM person_company_roles WHERE person_id = (SELECT id FROM people WHERE email = 'om@example.com')"
    )

    await seed(url)

    expect(await companyWideRoles()).toEqual(COMPANY_WIDE)
  })
})
