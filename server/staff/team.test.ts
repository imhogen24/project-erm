import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ProjectStatus, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"

import { projectsNeedingTeam, teamOf } from "./team"

const database = createTestDatabase()

let admin: string

async function addPerson(name = "Ama") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  return rows[0]!.id
}

async function addProject(
  name: string,
  status: ProjectStatus = "active",
  createdAt = new Date()
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track, status, created_at) VALUES ($1, $2, 'Tier_3', $3, $4) RETURNING id",
    [name, `T3-${crypto.randomUUID()}`, status, createdAt]
  )

  return rows[0]!.id
}

async function holds(personId: string, projectId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )
}

beforeEach(async () => {
  await resetTestData(database)

  admin = await addPerson("Admin")
  await database.pool.query(
    "INSERT INTO person_company_roles (person_id, role) VALUES ($1, 'IT/Admin')",
    [admin]
  )
})

afterAll(async () => {
  await database.pool.end()
})

describe("projectsNeedingTeam", () => {
  it("lists a project with nobody on it, with what is missing", async () => {
    const projectId = await addProject("Aquaresh")

    const listed = await projectsNeedingTeam(database, admin)

    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: projectId,
      name: "Aquaresh",
      serviceTrack: "Tier_3",
      missing: ["PM", "OM", "FO"],
    })
    expect(listed[0]!.requestId).toMatch(/^T3-/)
  })

  it("lists a project that has a PM but no OM", async () => {
    const projectId = await addProject("Kofi Works")

    await holds(await addPerson("Pat"), projectId, "PM")

    const listed = await projectsNeedingTeam(database, admin)

    expect(listed.map((project) => project.missing)).toEqual([["OM", "FO"]])
  })

  it("leaves out a project that has a PM and an OM, even with no finance checker", async () => {
    const projectId = await addProject("Full Crew")

    await holds(await addPerson("Pat"), projectId, "PM")
    await holds(await addPerson("Olu"), projectId, "OM")

    expect(await projectsNeedingTeam(database, admin)).toEqual([])
  })

  it("leaves out projects that are rejected, closed or completed, and keeps one on hold", async () => {
    await addProject("Spam", "rejected")
    await addProject("Done", "completed")
    await addProject("Shut", "closed")

    const held = await addProject("Paused", "on_hold")

    const listed = await projectsNeedingTeam(database, admin)

    expect(listed.map((project) => project.id)).toEqual([held])
  })

  it("puts the newest project first", async () => {
    await addProject("Old", "active", new Date("2026-01-01T00:00:00Z"))
    await addProject("Newest", "active", new Date("2026-03-01T00:00:00Z"))
    await addProject("Middle", "active", new Date("2026-02-01T00:00:00Z"))

    const listed = await projectsNeedingTeam(database, admin)

    expect(listed.map((project) => project.name)).toEqual([
      "Newest",
      "Middle",
      "Old",
    ])
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const projectId = await addProject("Aquaresh")
    const pm = await addPerson("Pat")

    await holds(pm, projectId, "PM")

    await expect(projectsNeedingTeam(database, pm)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })
})

describe("teamOf", () => {
  it("returns the project and the people on it in the staffing roles, PM first", async () => {
    const projectId = await addProject("Aquaresh")
    const pm = await addPerson("Pat")
    const lead = await addPerson("Lea")
    const head = await addPerson("Hal")

    await holds(pm, projectId, "PM")
    await holds(lead, projectId, "LE")
    await holds(head, projectId, "HE")

    const team = await teamOf(database, admin, projectId)

    expect(team?.project).toMatchObject({ id: projectId, name: "Aquaresh" })
    expect(team?.members).toEqual([
      { personId: pm, name: "Pat", role: "PM" },
      { personId: lead, name: "Lea", role: "LE" },
    ])
  })

  it("returns nothing for a project that does not exist", async () => {
    expect(await teamOf(database, admin, crypto.randomUUID())).toBeUndefined()
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const projectId = await addProject("Aquaresh")
    const pm = await addPerson("Pat")

    await holds(pm, projectId, "PM")

    await expect(teamOf(database, pm, projectId)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })
})
