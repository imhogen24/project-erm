import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { removeE2eData } from "./e2e-data"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "./testing"

const database = createTestDatabase()

const url = process.env.TEST_DATABASE_URL!

// What the browser tests make: a project whose request ID is a UUID, and a
// person whose email is hex.
const TEST_REQUEST = "T1-7c2f0a52-3b1d-4f6e-9a8c-1d2e3f4a5b6c"

const TEST_EMAIL = "4f0c7813-41025a1e@example.com"

// What the seed makes, which must stay.
const SEED_REQUEST = "T1-1789787898386"

const SEED_EMAIL = "om@example.com"

async function addProject(requestId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [`Project ${requestId}`, requestId]
  )

  return rows[0]!.id
}

async function addPerson(email: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [`Person ${email}`, email]
  )

  return rows[0]!.id
}

// A project with a person, a record, and lines in the logs that refuse to be
// deleted.
async function addWork(requestId: string, email: string) {
  const projectId = await addProject(requestId)
  const personId = await addPerson(email)

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'OM')",
    [personId, projectId]
  )

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, submitted_by) VALUES ($1, 'D1.1', 'submitted', $2) RETURNING id",
    [projectId, personId]
  )

  await database.pool.query(
    "INSERT INTO audit_log (project_id, actor_id, record_id, action, field) VALUES ($1, $2, $3, 'created', 'x')",
    [projectId, personId, rows[0]!.id]
  )
  await database.pool.query(
    "INSERT INTO access_log (actor_id, action, person_id, email) VALUES ($1, 'signed_in', $1, $2)",
    [personId, email]
  )

  return { projectId, personId, recordId: rows[0]!.id }
}

async function count(table: string, column: string, id: string) {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table} WHERE ${column} = $1`,
    [id]
  )

  return Number(rows[0]!.n)
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("removeE2eData", () => {
  it("removes a test project and person with everything that points at them", async () => {
    const test = await addWork(TEST_REQUEST, TEST_EMAIL)

    const removed = await removeE2eData(url)

    expect(removed).toEqual({ projects: 1, people: 1 })
    expect(await count("projects", "id", test.projectId)).toBe(0)
    expect(await count("people", "id", test.personId)).toBe(0)
    expect(await count("tool_records", "id", test.recordId)).toBe(0)
    expect(await count("audit_log", "project_id", test.projectId)).toBe(0)
    expect(await count("access_log", "actor_id", test.personId)).toBe(0)
    expect(
      await count("person_project_roles", "person_id", test.personId)
    ).toBe(0)
  })

  it("leaves the seed project and people alone", async () => {
    const seed = await addWork(SEED_REQUEST, SEED_EMAIL)
    const test = await addWork(TEST_REQUEST, TEST_EMAIL)

    await removeE2eData(url)

    expect(await count("projects", "id", seed.projectId)).toBe(1)
    expect(await count("people", "id", seed.personId)).toBe(1)
    expect(await count("tool_records", "id", seed.recordId)).toBe(1)
    expect(await count("audit_log", "project_id", seed.projectId)).toBe(1)
    expect(await count("access_log", "actor_id", seed.personId)).toBe(1)
    expect(await count("projects", "id", test.projectId)).toBe(0)
  })

  it("leaves the system person alone", async () => {
    await removeE2eData(url)

    const { rows } = await database.pool.query(
      "SELECT 1 FROM people WHERE email = 'system@erm.invalid'"
    )

    expect(rows).toHaveLength(1)
  })

  it("removes the people the sign-in test makes", async () => {
    const id = await addPerson("sign-in-page@example.com")

    await removeE2eData(url)

    expect(await count("people", "id", id)).toBe(0)
  })

  it("does not switch the protection off for anyone else", async () => {
    const test = await addWork(TEST_REQUEST, TEST_EMAIL)
    const seed = await addWork(SEED_REQUEST, SEED_EMAIL)

    await removeE2eData(url)

    await expect(
      database.pool.query("DELETE FROM audit_log WHERE project_id = $1", [
        seed.projectId,
      ])
    ).rejects.toThrow()
    expect(await count("projects", "id", test.projectId)).toBe(0)
  })

  it("is harmless to run again", async () => {
    await addWork(TEST_REQUEST, TEST_EMAIL)

    await removeE2eData(url)

    expect(await removeE2eData(url)).toEqual({ projects: 0, people: 0 })
  })

  it("refuses a database that is not on this machine", async () => {
    await expect(
      removeE2eData("postgres://erm:erm@db.example.com:5432/erm")
    ).rejects.toThrow(/not local/)
  })
})
