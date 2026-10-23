import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type RecordState, type Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { defineTool } from "@/server/tools/define-tool"

import { getProjectOverview, listProjectsFor, type ToolState } from "./projects"

const database = createTestDatabase()

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  )

  return rows[0]!.id
}

async function addPerson(name = "Ama") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  return rows[0]!.id
}

async function grant(personId: string, projectId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )
}

// Inserted directly, so a test can pick the state and the time.
async function addRecord(
  projectId: string,
  toolId: string,
  state: RecordState,
  createdAt = new Date()
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, created_at) VALUES ($1, $2, $3, $4)",
    [projectId, toolId, state, createdAt]
  )
}

function tool(id: string) {
  return defineTool({
    id,
    name: `Tool ${id}`,
    workbook: "D1",
    fields: [{ key: "note", label: "Note", type: "text" }],
  })
}

// What the overview shows for one tool.
function shown(id: string, state: ToolState) {
  return { toolId: id, name: `Tool ${id}`, workbook: "D1", state }
}

// OM can read all four.
const fourTools = [tool("D1.3"), tool("D1.4"), tool("D1.8"), tool("D1.9")]

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("listProjectsFor", () => {
  it("lists only the projects the person explicitly holds a role on, sorted by name", async () => {
    const useScalpel = await addProject("useScalpel")
    const tryEkg = await addProject("tryEkg")
    await addProject("doLiposuction")

    const person = await addPerson("Duneeh Kezia")
    await grant(person, useScalpel, "PM")
    await grant(person, tryEkg, "LO")

    const result = await listProjectsFor(database, person)

    expect(result).toEqual([
      { id: tryEkg, name: "tryEkg", roles: ["LO"] },
      { id: useScalpel, name: "useScalpel", roles: ["PM"] },
    ])
  })

  it("lists a project once when the person holds several roles on it", async () => {
    const project = await addProject("Project A")
    const person = await addPerson()
    await grant(person, project, "PM")
    await grant(person, project, "OM")

    const result = await listProjectsFor(database, person)

    expect(result).toEqual([
      { id: project, name: "Project A", roles: ["OM", "PM"] },
    ])
  })

  it("gives an empty list to a person with no roles anywhere", async () => {
    await addProject("Project A")
    const person = await addPerson()

    expect(await listProjectsFor(database, person)).toEqual([])
  })

  it("shows each person only their own projects", async () => {
    const projectA = await addProject("Project A")
    const projectB = await addProject("Project B")
    const ama = await addPerson("Ama")
    const kofi = await addPerson("Kofi")
    await grant(ama, projectA, "PM")
    await grant(kofi, projectB, "LE")

    expect(await listProjectsFor(database, ama)).toEqual([
      { id: projectA, name: "Project A", roles: ["PM"] },
    ])
    expect(await listProjectsFor(database, kofi)).toEqual([
      { id: projectB, name: "Project B", roles: ["LE"] },
    ])
  })
})

describe("getProjectOverview", () => {
  let project: string

  let person: string

  beforeEach(async () => {
    project = await addProject("Project A")
    person = await addPerson()
  })

  it("shows every readable tool as not started when there are no records", async () => {
    await grant(person, project, "OM")

    const result = await getProjectOverview(
      database,
      person,
      project,
      fourTools
    )

    expect(result).toEqual({
      id: project,
      name: "Project A",
      tools: [
        shown("D1.3", "notStarted"),
        shown("D1.4", "notStarted"),
        shown("D1.8", "notStarted"),
        shown("D1.9", "notStarted"),
      ],
    })
  })

  it("shows each tool's own state", async () => {
    await grant(person, project, "OM")
    await addRecord(project, "D1.3", "draft")
    await addRecord(project, "D1.4", "submitted")
    await addRecord(project, "D1.8", "approved")
    await addRecord(project, "D1.9", "locked")

    const result = await getProjectOverview(
      database,
      person,
      project,
      fourTools
    )

    expect(result.tools).toEqual([
      shown("D1.3", "draft"),
      shown("D1.4", "submitted"),
      shown("D1.8", "approved"),
      shown("D1.9", "locked"),
    ])
  })

  it("shows the state of the newest record", async () => {
    await grant(person, project, "OM")
    // Inserted newest first, so the order of insertion cannot decide it.
    await addRecord(project, "D1.3", "draft", new Date("2026-02-01"))
    await addRecord(project, "D1.3", "locked", new Date("2026-01-01"))

    const result = await getProjectOverview(database, person, project, [
      tool("D1.3"),
    ])

    expect(result.tools).toEqual([shown("D1.3", "draft")])
  })

  it("skips void records when it picks the newest", async () => {
    await grant(person, project, "OM")
    // D1.3 restarted after a rollback, D1.8 was voided last, D1.9 was only voided.
    await addRecord(project, "D1.3", "void", new Date("2026-01-01"))
    await addRecord(project, "D1.3", "draft", new Date("2026-02-01"))
    await addRecord(project, "D1.8", "locked", new Date("2026-01-01"))
    await addRecord(project, "D1.8", "void", new Date("2026-02-01"))
    await addRecord(project, "D1.9", "void")

    const result = await getProjectOverview(
      database,
      person,
      project,
      fourTools
    )

    expect(result.tools).toEqual([
      shown("D1.3", "draft"),
      shown("D1.4", "notStarted"),
      shown("D1.8", "locked"),
      shown("D1.9", "notStarted"),
    ])
  })

  it("hides the tools the person's roles may not read", async () => {
    await grant(person, project, "LE")

    const result = await getProjectOverview(database, person, project, [
      tool("D1.3"),
      tool("D1.8"),
    ])

    expect(result.tools).toEqual([shown("D1.8", "notStarted")])
  })

  it("never shows a tool the permissions table does not know", async () => {
    for (const role of roles) {
      await grant(person, project, role)
    }

    const result = await getProjectOverview(database, person, project, [
      tool("X9.9"),
      tool("D1.8"),
    ])

    expect(result.tools).toEqual([shown("D1.8", "notStarted")])
  })

  it("refuses a project the person holds no role on", async () => {
    const other = await addProject("Project B")
    await grant(person, other, "OM")

    await expect(
      getProjectOverview(database, person, project, fourTools)
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("refuses a project that does not exist the same way", async () => {
    await grant(person, project, "OM")

    await expect(
      getProjectOverview(database, person, crypto.randomUUID(), fourTools)
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("ignores records on other projects", async () => {
    const other = await addProject("Project B")
    await grant(person, project, "OM")
    await addRecord(other, "D1.3", "locked")

    const result = await getProjectOverview(database, person, project, [
      tool("D1.3"),
    ])

    expect(result.tools).toEqual([shown("D1.3", "notStarted")])
  })

  it("gives the tools back in the order they were passed in", async () => {
    await grant(person, project, "OM")

    const result = await getProjectOverview(database, person, project, [
      tool("D1.9"),
      tool("D1.3"),
      tool("D1.8"),
    ])

    expect(result.tools.map((entry) => entry.toolId)).toEqual([
      "D1.9",
      "D1.3",
      "D1.8",
    ])
  })
})
