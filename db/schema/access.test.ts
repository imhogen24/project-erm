import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "../testing"

const database = createTestDatabase()

// The 19 roles.
const ROLES = [
  "Client",
  "OM",
  "PM",
  "LE",
  "AE",
  "LD",
  "FO",
  "CA",
  "HE",
  "PO",
  "IO",
  "WS",
  "T",
  "QA",
  "LFE",
  "LO",
  "CR",
  "IT/Admin",
  "MKT",
]

async function addPerson(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}@example.com`]
  )

  return rows[0]!.id
}

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, `T1-${crypto.randomUUID()}`]
  )

  return rows[0]!.id
}

function giveRole(personId: string, projectId: string, role: string) {
  return database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )
}

async function rolesOf(personId: string, projectId: string) {
  const { rows } = await database.pool.query<{ role: string }>(
    "SELECT role FROM person_project_roles WHERE person_id = $1 AND project_id = $2",
    [personId, projectId]
  )

  return rows.map((row) => row.role).sort()
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("roles", () => {
  it("holds exactly the 19 roles", async () => {
    const { rows } = await database.pool.query<{ role: string }>(
      "SELECT unnest(enum_range(NULL::role))::text AS role"
    )

    expect(rows.map((row) => row.role).sort()).toEqual([...ROLES].sort())
  })

  it("rejects a role that is not in the list", async () => {
    const personId = await addPerson("Ama")
    const projectId = await addProject("Boiler")

    await expect(giveRole(personId, projectId, "Owner")).rejects.toThrow()
  })
})

describe("per-project roles", () => {
  it("stores two roles for one person on one project", async () => {
    const personId = await addPerson("Ama")
    const projectId = await addProject("Boiler")

    await giveRole(personId, projectId, "PM")
    await giveRole(personId, projectId, "LE")

    expect(await rolesOf(personId, projectId)).toEqual(["LE", "PM"])
  })

  it("stores the same role only once per person and project", async () => {
    const personId = await addPerson("Ama")
    const projectId = await addProject("Boiler")

    await giveRole(personId, projectId, "PM")

    await expect(giveRole(personId, projectId, "PM")).rejects.toThrow()
  })

  it("gives no role on a project where the person was not given one", async () => {
    const personId = await addPerson("Ama")
    const projectA = await addProject("Boiler")
    const projectB = await addProject("Conveyor")

    await giveRole(personId, projectA, "PM")

    expect(await rolesOf(personId, projectB)).toEqual([])
  })

  it("removes access as soon as the role is removed", async () => {
    const personId = await addPerson("Ama")
    const projectId = await addProject("Boiler")

    await giveRole(personId, projectId, "PM")
    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = $1 AND project_id = $2 AND role = 'PM'",
      [personId, projectId]
    )

    expect(await rolesOf(personId, projectId)).toEqual([])
  })

  it("removes a person's roles when the person is removed", async () => {
    const personId = await addPerson("Ama")
    const projectId = await addProject("Boiler")

    await giveRole(personId, projectId, "PM")
    await database.pool.query("DELETE FROM people WHERE id = $1", [personId])

    const { rows } = await database.pool.query(
      "SELECT 1 FROM person_project_roles WHERE project_id = $1",
      [projectId]
    )

    expect(rows).toHaveLength(0)
  })
})

describe("people", () => {
  it("does not allow two people with the same email", async () => {
    await addPerson("Ama")

    await expect(addPerson("Ama")).rejects.toThrow()
  })
})
