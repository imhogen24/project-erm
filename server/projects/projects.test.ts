import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type RecordState, type Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { defineTool } from "@/server/tools/define-tool"

import {
  DuplicateRequestIdError,
  InvalidProjectStatusError,
  InvalidServiceTrackError,
  ProjectStatusReasonMissingError,
  createProject,
  getProjectOverview,
  listProjectsFor,
  setProjectStatus,
  type ToolState,
} from "./projects"

const database = createTestDatabase()

// The request ID comes from the name, so a test can say what a project shows.
async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, `T1-${name}`]
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

async function grantCompanyWide(personId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
    [personId, role]
  )
}

// Inserted directly, so a test can pick the state, the time and the cycle.
async function addRecord(
  projectId: string,
  toolId: string,
  state: RecordState,
  createdAt = new Date(),
  cycle = 1
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, created_at, cycle) VALUES ($1, $2, $3, $4, $5)",
    [projectId, toolId, state, createdAt, cycle]
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

// What the project list shows for one project made by addProject.
function listed(id: string, name: string, held: Role[]) {
  return {
    id,
    name,
    requestId: `T1-${name}`,
    serviceTrack: "Tier_1",
    status: "active",
    roles: held,
  }
}

async function projectLines(projectId: string) {
  const { rows } = await database.pool.query(
    "SELECT record_id, action, field, old_value, new_value, reason FROM audit_log WHERE project_id = $1 ORDER BY field",
    [projectId]
  )

  return rows
}

async function statusOf(projectId: string) {
  const { rows } = await database.pool.query<{ status: string }>(
    "SELECT status FROM projects WHERE id = $1",
    [projectId]
  )

  return rows[0]!.status
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
      listed(tryEkg, "tryEkg", ["LO"]),
      listed(useScalpel, "useScalpel", ["PM"]),
    ])
  })

  it("lists a project once when the person holds several roles on it", async () => {
    const project = await addProject("Project A")
    const person = await addPerson()
    await grant(person, project, "PM")
    await grant(person, project, "OM")

    const result = await listProjectsFor(database, person)

    expect(result).toEqual([listed(project, "Project A", ["OM", "PM"])])
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
      listed(projectA, "Project A", ["PM"]),
    ])
    expect(await listProjectsFor(database, kofi)).toEqual([
      listed(projectB, "Project B", ["LE"]),
    ])
  })
})

describe("listProjectsFor, with a company-wide IT/Admin", () => {
  it("lists every project", async () => {
    const projectA = await addProject("Project A")
    const projectB = await addProject("Project B")
    const admin = await addPerson("Efua")
    await grantCompanyWide(admin, "IT/Admin")

    expect(await listProjectsFor(database, admin)).toEqual([
      listed(projectA, "Project A", ["IT/Admin"]),
      listed(projectB, "Project B", ["IT/Admin"]),
    ])
  })

  it("lists a project created after the role was given", async () => {
    const admin = await addPerson("Efua")
    await grantCompanyWide(admin, "IT/Admin")
    const inquiry = await addProject("New inquiry")

    expect(await listProjectsFor(database, admin)).toEqual([
      listed(inquiry, "New inquiry", ["IT/Admin"]),
    ])
  })

  it("adds the project roles to IT/Admin, but not the qualifications", async () => {
    const projectA = await addProject("Project A")
    const projectB = await addProject("Project B")
    const person = await addPerson("Efua")
    await grantCompanyWide(person, "IT/Admin")
    await grantCompanyWide(person, "OM")
    await grant(person, projectA, "LE")

    expect(await listProjectsFor(database, person)).toEqual([
      listed(projectA, "Project A", ["LE", "IT/Admin"]),
      listed(projectB, "Project B", ["IT/Admin"]),
    ])
  })
})

describe("listProjectsFor, with a qualification", () => {
  it("does not list a project the person is not assigned to", async () => {
    const om = await addPerson("Efua")
    await grantCompanyWide(om, "OM")
    await addProject("New inquiry")

    expect(await listProjectsFor(database, om)).toEqual([])
  })

  it("lists only the projects the person is assigned to", async () => {
    const projectA = await addProject("Project A")
    await addProject("Project B")
    const pm = await addPerson("Efua")
    await grantCompanyWide(pm, "PM")
    await grantCompanyWide(pm, "OM")
    await grant(pm, projectA, "PM")

    expect(await listProjectsFor(database, pm)).toEqual([
      listed(projectA, "Project A", ["PM"]),
    ])
  })
})

describe("getProjectOverview, with company-wide roles", () => {
  it("shows a new project to a company-wide IT/Admin", async () => {
    const project = await addProject("New inquiry")
    const admin = await addPerson("Efua")
    await grantCompanyWide(admin, "IT/Admin")

    const overview = await getProjectOverview(
      database,
      admin,
      project,
      fourTools
    )

    expect(overview.id).toBe(project)
  })

  it("refuses a person only qualified for OM", async () => {
    const project = await addProject("New inquiry")
    const om = await addPerson("Efua")
    await grantCompanyWide(om, "OM")

    await expect(
      getProjectOverview(database, om, project, fourTools)
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("still refuses a project that does not exist", async () => {
    const admin = await addPerson("Efua")
    await grantCompanyWide(admin, "IT/Admin")

    await expect(
      getProjectOverview(
        database,
        admin,
        "00000000-0000-0000-0000-000000000000",
        fourTools
      )
    ).rejects.toThrow(PermissionDeniedError)
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
      requestId: "T1-Project A",
      serviceTrack: "Tier_1",
      status: "active",
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
    // Inserted newest first, so the order of insertion cannot decide it. A
    // tool has one live record per cycle, so the newer one is in cycle 2.
    await addRecord(project, "D1.3", "draft", new Date("2026-02-01"), 2)
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

describe("createProject", () => {
  it("stores the request ID and service track, and starts active", async () => {
    const actor = await addPerson()

    const project = await createProject(database, actor, {
      name: "Boiler",
      serviceTrack: "Tier_1",
      requestId: "T1-1789787898386",
    })

    expect(project).toEqual({
      id: expect.any(String),
      name: "Boiler",
      requestId: "T1-1789787898386",
      serviceTrack: "Tier_1",
      status: "active",
    })
  })

  it("lets only one of two projects with the same request ID through", async () => {
    const actor = await addPerson()

    const input = {
      name: "Boiler",
      serviceTrack: "Tier_1",
      requestId: "T1-1789787898386",
    } as const

    const results = await Promise.allSettled([
      createProject(database, actor, input),
      createProject(database, actor, input),
    ])

    const refused = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )

    expect(refused).toHaveLength(1)
    expect(refused[0]!.reason).toBeInstanceOf(DuplicateRequestIdError)

    const { rows } = await database.pool.query(
      "SELECT 1 FROM projects WHERE request_id = $1",
      [input.requestId]
    )

    expect(rows).toHaveLength(1)
  })

  it("refuses a project without a service track", async () => {
    const actor = await addPerson()

    await expect(
      createProject(database, actor, {
        name: "Boiler",
        requestId: "T1-1789787898386",
        // @ts-expect-error a caller outside TypeScript can still leave it out
        serviceTrack: undefined,
      })
    ).rejects.toThrow(InvalidServiceTrackError)
  })

  it("writes a project line for each starting value", async () => {
    const actor = await addPerson()

    const project = await createProject(database, actor, {
      name: "Boiler",
      serviceTrack: "Tier_3",
      requestId: "T3-1789788332380",
    })

    const line = (field: string, value: string) => ({
      record_id: null,
      action: "created",
      field,
      old_value: null,
      new_value: value,
      reason: null,
    })

    expect(await projectLines(project.id)).toEqual([
      line("name", "Boiler"),
      line("request_id", "T3-1789788332380"),
      line("service_track", "Tier_3"),
      line("status", "active"),
    ])
  })
})

describe("setProjectStatus", () => {
  let project: string

  let pm: string

  beforeEach(async () => {
    project = await addProject("Boiler")
    pm = await addPerson("Kofi")
    await grant(pm, project, "PM")
  })

  it("sets the status and logs the old status, the new status and the reason", async () => {
    await setProjectStatus(database, pm, project, "rejected", "Not a fit")

    expect(await statusOf(project)).toBe("rejected")
    expect(await projectLines(project)).toEqual([
      {
        record_id: null,
        action: "transitioned",
        field: "status",
        old_value: "active",
        new_value: "rejected",
        reason: "Not a fit",
      },
    ])
  })

  it.each(["", "   "])("refuses the reason %j", async (reason) => {
    await expect(
      setProjectStatus(database, pm, project, "rejected", reason)
    ).rejects.toThrow(ProjectStatusReasonMissingError)
    expect(await statusOf(project)).toBe("active")
  })

  it("refuses anyone but the PM, even one with every other role", async () => {
    const notPm = await addPerson("Ama")

    for (const role of roles.filter((role) => role !== "PM")) {
      await grant(notPm, project, role)
    }

    await expect(
      setProjectStatus(database, notPm, project, "rejected", "Not a fit")
    ).rejects.toThrow(PermissionDeniedError)
    expect(await statusOf(project)).toBe("active")
  })

  it("refuses the PM of another project", async () => {
    const otherPm = await addPerson("Esi")
    await grant(otherPm, await addProject("Kiln"), "PM")

    await expect(
      setProjectStatus(database, otherPm, project, "rejected", "Not a fit")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("refuses a person qualified for PM but not assigned to the project", async () => {
    const qualifiedPm = await addPerson("Esi")
    await grantCompanyWide(qualifiedPm, "PM")

    await expect(
      setProjectStatus(database, qualifiedPm, project, "on_hold", "Waiting")
    ).rejects.toThrow(PermissionDeniedError)
    expect(await statusOf(project)).toBe("active")
  })

  it("refuses the status the project already has", async () => {
    await expect(
      setProjectStatus(database, pm, project, "active", "Still going")
    ).rejects.toThrow(InvalidProjectStatusError)
    expect(await projectLines(project)).toEqual([])
  })

  it("refuses a status that does not exist", async () => {
    await expect(
      // @ts-expect-error a caller outside TypeScript can still send one
      setProjectStatus(database, pm, project, "paused", "Waiting")
    ).rejects.toThrow(InvalidProjectStatusError)
  })

  it("shows the new status in the overview and the list", async () => {
    await setProjectStatus(database, pm, project, "on_hold", "Waiting")

    const overview = await getProjectOverview(database, pm, project, fourTools)

    expect(overview.status).toBe("on_hold")
    expect(await listProjectsFor(database, pm)).toEqual([
      { ...listed(project, "Boiler", ["PM"]), status: "on_hold" },
    ])
  })
})
