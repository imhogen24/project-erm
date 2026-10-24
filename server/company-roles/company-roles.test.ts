import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  PermissionDeniedError,
  can,
  companyRolesOf,
} from "@/server/permissions/permissions"

import {
  InvalidCompanyRoleError,
  LastItAdminError,
  giveCompanyRoles,
  removeCompanyRole,
} from "./company-roles"

const database = createTestDatabase()

let projectId: string

let admin: string

let kofi: string

async function addPerson(email: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Someone', $1) RETURNING id",
    [email]
  )

  return rows[0]!.id
}

async function holdCompanyWide(personId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
    [personId, role]
  )
}

async function holdOnProject(personId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )
}

async function logLines() {
  const { rows } = await database.pool.query<{
    actor_id: string
    action: string
    person_id: string | null
    email: string
    project_id: string | null
    roles: string[]
  }>(
    `SELECT actor_id, action, person_id, email, project_id, roles::text[] AS roles
     FROM access_log
     ORDER BY created_at`
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1789787898386', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id
  admin = await addPerson("admin@example.com")
  await holdCompanyWide(admin, "IT/Admin")
  kofi = await addPerson("kofi@example.com")
})

afterAll(async () => {
  await database.pool.end()
})

describe("giving company-wide roles", () => {
  it("gives the roles on every project", async () => {
    await giveCompanyRoles(database, admin, kofi, ["FO"])

    expect(await companyRolesOf(database, kofi)).toEqual(["FO"])
    expect(await can(database, kofi, projectId, "D1.14", "read")).toBe(true)
  })

  it("logs who gave which roles to whom", async () => {
    await giveCompanyRoles(database, admin, kofi, ["FO", "PM"])

    expect(await logLines()).toEqual([
      {
        actor_id: admin,
        action: "roles_added",
        person_id: kofi,
        email: "kofi@example.com",
        project_id: null,
        roles: ["FO", "PM"],
      },
    ])
  })

  it("logs only the roles that were new", async () => {
    await holdCompanyWide(kofi, "FO")

    await giveCompanyRoles(database, admin, kofi, ["FO", "PM"])

    expect((await logLines()).map((line) => line.roles)).toEqual([["PM"]])
  })

  it("writes no log line when nothing changed", async () => {
    await holdCompanyWide(kofi, "FO")

    await giveCompanyRoles(database, admin, kofi, ["FO"])

    expect(await logLines()).toEqual([])
  })

  it("refuses Client", async () => {
    await expect(
      giveCompanyRoles(database, admin, kofi, ["Client"])
    ).rejects.toBeInstanceOf(InvalidCompanyRoleError)
    expect(await companyRolesOf(database, kofi)).toEqual([])
  })

  it("refuses an empty role list", async () => {
    await expect(
      giveCompanyRoles(database, admin, kofi, [])
    ).rejects.toBeInstanceOf(InvalidCompanyRoleError)
  })

  it("refuses a PM", async () => {
    const pm = await addPerson("pm@example.com")
    await holdCompanyWide(pm, "PM")

    await expect(
      giveCompanyRoles(database, pm, kofi, ["FO"])
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await companyRolesOf(database, kofi)).toEqual([])
  })

  it("refuses an IT/Admin of one project only", async () => {
    const projectAdmin = await addPerson("project-admin@example.com")
    await holdOnProject(projectAdmin, "IT/Admin")

    await expect(
      giveCompanyRoles(database, projectAdmin, kofi, ["FO"])
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("removing a company-wide role", () => {
  it("refuses on the next permission check", async () => {
    await holdCompanyWide(kofi, "OM")
    expect(await can(database, kofi, projectId, "D1.2", "write")).toBe(true)

    await removeCompanyRole(database, admin, kofi, "OM")

    expect(await can(database, kofi, projectId, "D1.2", "write")).toBe(false)
  })

  it("logs who removed which role from whom", async () => {
    await holdCompanyWide(kofi, "OM")

    await removeCompanyRole(database, admin, kofi, "OM")

    expect(await logLines()).toEqual([
      {
        actor_id: admin,
        action: "roles_removed",
        person_id: kofi,
        email: "kofi@example.com",
        project_id: null,
        roles: ["OM"],
      },
    ])
  })

  it("keeps the same role held on a project", async () => {
    await holdCompanyWide(kofi, "OM")
    await holdOnProject(kofi, "OM")

    await removeCompanyRole(database, admin, kofi, "OM")

    expect(await can(database, kofi, projectId, "D1.2", "write")).toBe(true)
  })

  it("writes no log line for a role the person did not hold", async () => {
    await removeCompanyRole(database, admin, kofi, "OM")

    expect(await logLines()).toEqual([])
  })

  it("refuses anyone but a company-wide IT/Admin", async () => {
    const pm = await addPerson("pm@example.com")
    await holdCompanyWide(pm, "PM")
    await holdCompanyWide(kofi, "OM")

    await expect(
      removeCompanyRole(database, pm, kofi, "OM")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await companyRolesOf(database, kofi)).toEqual(["OM"])
  })

  it("refuses to remove the last company-wide IT/Admin", async () => {
    await expect(
      removeCompanyRole(database, admin, admin, "IT/Admin")
    ).rejects.toBeInstanceOf(LastItAdminError)
    expect(await companyRolesOf(database, admin)).toEqual(["IT/Admin"])
    expect(await logLines()).toEqual([])
  })

  it("removes an IT/Admin while another one remains", async () => {
    await holdCompanyWide(kofi, "IT/Admin")

    await removeCompanyRole(database, admin, admin, "IT/Admin")

    expect(await companyRolesOf(database, admin)).toEqual([])
    expect(await companyRolesOf(database, kofi)).toEqual(["IT/Admin"])
  })

  it("keeps one IT/Admin when two remove each other at once", async () => {
    await holdCompanyWide(kofi, "IT/Admin")

    const results = await Promise.allSettled([
      removeCompanyRole(database, admin, kofi, "IT/Admin"),
      removeCompanyRole(database, kofi, admin, "IT/Admin"),
    ])

    const { rows } = await database.pool.query(
      "SELECT 1 FROM person_company_roles WHERE role = 'IT/Admin'"
    )

    expect(rows).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
  })
})
