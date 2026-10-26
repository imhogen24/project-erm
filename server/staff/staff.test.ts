import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ProjectStatus, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  PermissionDeniedError,
  rolesOn,
} from "@/server/permissions/permissions"

import {
  NotQualifiedError,
  RoleTakenError,
  WorkloadLimitError,
  assignStaff,
  availableStaff,
  unassignStaff,
  workloadOf,
} from "./staff"

const database = createTestDatabase()

let admin: string

async function addPerson(name = "Ama") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  return rows[0]!.id
}

// Company-wide, so it is a qualification, or access to every project for
// IT/Admin.
async function qualify(personId: string, ...held: Role[]) {
  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [personId, role]
    )
  }
}

async function addProject(status: ProjectStatus = "active") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track, status) VALUES ('Boiler', $1, 'Tier_1', $2) RETURNING id",
    [`T1-${crypto.randomUUID()}`, status]
  )

  return rows[0]!.id
}

// Puts the person on a new project directly, to build up a workload.
async function alreadyOn(
  personId: string,
  role: Role,
  status: ProjectStatus = "active"
) {
  const projectId = await addProject(status)

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )

  return projectId
}

function assign(personId: string, projectId: string, role: Role, by = admin) {
  return assignStaff(database, by, { projectId, personId, role })
}

async function accessLines(personId: string, projectId: string) {
  const { rows } = await database.pool.query(
    // An enum array comes back from the driver as text unless cast.
    "SELECT actor_id, action, roles::text[] AS roles FROM access_log WHERE person_id = $1 AND project_id = $2 ORDER BY created_at",
    [personId, projectId]
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)

  admin = await addPerson("Admin")
  await qualify(admin, "IT/Admin")
})

afterAll(async () => {
  await database.pool.end()
})

describe("assignStaff", () => {
  it("gives a qualified person the role on the project, with an access log line", async () => {
    const om = await addPerson()
    const project = await addProject()

    await qualify(om, "OM")
    await assign(om, project, "OM")

    expect(await rolesOn(database, om, project)).toEqual(["OM"])
    expect(await accessLines(om, project)).toEqual([
      { actor_id: admin, action: "roles_added", roles: ["OM"] },
    ])
  })

  it("refuses a person who is not qualified for the role", async () => {
    const person = await addPerson()
    const project = await addProject()

    await qualify(person, "OM")

    await expect(assign(person, project, "PM")).rejects.toThrow(
      NotQualifiedError
    )
    expect(await rolesOn(database, person, project)).toEqual([])
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const pm = await addPerson("Kofi")
    const om = await addPerson()
    const project = await addProject()

    await qualify(om, "OM")
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
      [pm, project]
    )

    await expect(assign(om, project, "OM", pm)).rejects.toThrow(
      PermissionDeniedError
    )
  })

  it("refuses a fourth PM project, naming the limit", async () => {
    const pm = await addPerson()

    await qualify(pm, "PM")

    for (let index = 0; index < 3; index++) {
      await alreadyOn(pm, "PM")
    }

    const refused = assign(pm, await addProject(), "PM")

    await expect(refused).rejects.toThrow(WorkloadLimitError)
    await expect(refused).rejects.toThrow(/3/)
  })

  it("refuses a seventh OM project", async () => {
    const om = await addPerson()

    await qualify(om, "OM")

    for (let index = 0; index < 6; index++) {
      await alreadyOn(om, "OM")
    }

    await expect(assign(om, await addProject(), "OM")).rejects.toThrow(
      WorkloadLimitError
    )
  })

  it("counts LE and AE together as engineering", async () => {
    const engineer = await addPerson()

    await qualify(engineer, "LE", "AE")
    await alreadyOn(engineer, "LE")
    await alreadyOn(engineer, "LE")
    await alreadyOn(engineer, "AE")

    await expect(assign(engineer, await addProject(), "AE")).rejects.toThrow(
      WorkloadLimitError
    )
  })

  it("frees the slot of a closed project", async () => {
    const pm = await addPerson()

    await qualify(pm, "PM")
    await alreadyOn(pm, "PM")
    await alreadyOn(pm, "PM")
    await alreadyOn(pm, "PM", "closed")

    const project = await addProject()

    await assign(pm, project, "PM")

    expect(await rolesOn(database, pm, project)).toEqual(["PM"])
  })

  it("still counts a project on hold", async () => {
    const pm = await addPerson()

    await qualify(pm, "PM")
    await alreadyOn(pm, "PM")
    await alreadyOn(pm, "PM")
    await alreadyOn(pm, "PM", "on_hold")

    await expect(assign(pm, await addProject(), "PM")).rejects.toThrow(
      WorkloadLimitError
    )
  })

  it("keeps the groups separate, so a full PM can still take an OM project", async () => {
    const person = await addPerson()

    await qualify(person, "PM", "OM")

    for (let index = 0; index < 3; index++) {
      await alreadyOn(person, "PM")
    }

    const project = await addProject()

    await assign(person, project, "OM")

    expect(await rolesOn(database, person, project)).toEqual(["OM"])
  })

  it("refuses a second PM on the same project", async () => {
    const first = await addPerson("Ama")
    const second = await addPerson("Kofi")
    const project = await addProject()

    await qualify(first, "PM")
    await qualify(second, "PM")
    await assign(first, project, "PM")

    await expect(assign(second, project, "PM")).rejects.toThrow(RoleTakenError)
  })

  it("refuses a second OM on the same project", async () => {
    const first = await addPerson("Ama")
    const second = await addPerson("Kofi")
    const project = await addProject()

    await qualify(first, "OM")
    await qualify(second, "OM")
    await assign(first, project, "OM")

    await expect(assign(second, project, "OM")).rejects.toThrow(RoleTakenError)
  })

  it("allows several engineers on one project", async () => {
    const first = await addPerson("Ama")
    const second = await addPerson("Kofi")
    const project = await addProject()

    await qualify(first, "LE")
    await qualify(second, "LE")
    await assign(first, project, "LE")
    await assign(second, project, "LE")

    expect(await rolesOn(database, second, project)).toEqual(["LE"])
  })

  it("lets only one of two simultaneous assignments past the limit through", async () => {
    const pm = await addPerson()

    await qualify(pm, "PM")
    await alreadyOn(pm, "PM")
    await alreadyOn(pm, "PM")

    const third = await addProject()
    const fourth = await addProject()

    const results = await Promise.allSettled([
      assign(pm, third, "PM"),
      assign(pm, fourth, "PM"),
    ])

    const refused = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )

    expect(refused).toHaveLength(1)
    expect(refused[0]!.reason).toBeInstanceOf(WorkloadLimitError)
    expect(await workloadOf(database, pm)).toContainEqual({
      group: "PM",
      count: 3,
      limit: 3,
    })
  })

  it("lets only one of two simultaneous PMs onto one project", async () => {
    const first = await addPerson("Ama")
    const second = await addPerson("Kofi")
    const project = await addProject()

    await qualify(first, "PM")
    await qualify(second, "PM")

    const results = await Promise.allSettled([
      assign(first, project, "PM"),
      assign(second, project, "PM"),
    ])

    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
  })
})

describe("unassignStaff", () => {
  it("removes the role from the project only, with an access log line", async () => {
    const om = await addPerson()
    const project = await addProject()

    await qualify(om, "OM")

    const other = await alreadyOn(om, "OM")

    await assign(om, project, "OM")
    await unassignStaff(database, admin, {
      projectId: project,
      personId: om,
      role: "OM",
    })

    expect(await rolesOn(database, om, project)).toEqual([])
    expect(await rolesOn(database, om, other)).toEqual(["OM"])
    expect(await accessLines(om, project)).toEqual([
      { actor_id: admin, action: "roles_added", roles: ["OM"] },
      { actor_id: admin, action: "roles_removed", roles: ["OM"] },
    ])
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const om = await addPerson()
    const project = await alreadyOn(om, "OM")

    await expect(
      unassignStaff(database, om, {
        projectId: project,
        personId: om,
        role: "OM",
      })
    ).rejects.toThrow(PermissionDeniedError)
  })
})

describe("workloadOf", () => {
  it("counts each group's active and on-hold projects, a project once", async () => {
    const person = await addPerson()

    await alreadyOn(person, "PM")
    await alreadyOn(person, "PM", "on_hold")
    await alreadyOn(person, "PM", "completed")

    const both = await alreadyOn(person, "LE")

    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'AE')",
      [person, both]
    )

    const workload = await workloadOf(database, person)

    expect(workload).toContainEqual({ group: "PM", count: 2, limit: 3 })
    expect(workload).toContainEqual({ group: "Engineer", count: 1, limit: 3 })
    expect(workload).toContainEqual({ group: "OM", count: 0, limit: 6 })
    expect(workload).toContainEqual({ group: "Finance", count: 0, limit: 6 })
  })
})

describe("availableStaff", () => {
  it("lists the qualified people with the freest first, and marks the full ones", async () => {
    const busy = await addPerson("Busy")
    const free = await addPerson("Free")

    await qualify(busy, "PM")
    await qualify(free, "PM")

    for (let index = 0; index < 3; index++) {
      await alreadyOn(busy, "PM")
    }

    await alreadyOn(free, "PM")

    const result = await availableStaff(database, admin, "PM")

    expect(result.someoneFree).toBe(true)
    expect(result.people).toEqual([
      expect.objectContaining({
        personId: free,
        count: 1,
        limit: 3,
        full: false,
      }),
      expect.objectContaining({
        personId: busy,
        count: 3,
        limit: 3,
        full: true,
      }),
    ])
  })

  it("leaves out people not qualified for the role", async () => {
    const om = await addPerson()

    await qualify(om, "OM")

    expect((await availableStaff(database, admin, "PM")).people).toEqual([])
  })

  it("says nobody is free when every qualified person is at the limit", async () => {
    const pm = await addPerson()

    await qualify(pm, "PM")

    for (let index = 0; index < 3; index++) {
      await alreadyOn(pm, "PM")
    }

    expect((await availableStaff(database, admin, "PM")).someoneFree).toBe(
      false
    )
  })

  it("never marks anyone full for a role with no limit", async () => {
    const qa = await addPerson()

    await qualify(qa, "QA")

    for (let index = 0; index < 10; index++) {
      await alreadyOn(qa, "QA")
    }

    const result = await availableStaff(database, admin, "QA")

    expect(result.someoneFree).toBe(true)
    expect(result.people).toEqual([
      expect.objectContaining({ personId: qa, limit: null, full: false }),
    ])
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const pm = await addPerson()

    await expect(availableStaff(database, pm, "PM")).rejects.toThrow(
      PermissionDeniedError
    )
  })
})
