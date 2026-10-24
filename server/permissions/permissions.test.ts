import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"

import { accessRow, permissionMatrix } from "./matrix"
import {
  PermissionDeniedError,
  assertCan,
  assertHoldsRole,
  can,
  companyRolesOf,
  roleAllows,
  rolesOn,
  type Action,
} from "./permissions"

const database = createTestDatabase()

const actions: Action[] = ["read", "write", "approve"]

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  )

  return rows[0]!.id
}

async function addPerson(projectId: string, held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  const personId = rows[0]!.id

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [personId, projectId, role]
    )
  }

  return personId
}

async function answers(personId: string, projectId: string, toolId: string) {
  return Promise.all(
    actions.map((action) => can(database, personId, projectId, toolId, action))
  )
}

let projectId: string

beforeEach(async () => {
  await resetTestData(database)
  projectId = await addProject("Boiler")
})

afterAll(async () => {
  await database.pool.end()
})

describe("can", () => {
  it("RW allows read and write, not approve", async () => {
    // D1.8: LE is RW
    const person = await addPerson(projectId, ["LE"])

    expect(await answers(person, projectId, "D1.8")).toEqual([
      true,
      true,
      false,
    ])
  })

  it("RO allows read only", async () => {
    // D1.8: OM is RO
    const person = await addPerson(projectId, ["OM"])

    expect(await answers(person, projectId, "D1.8")).toEqual([
      true,
      false,
      false,
    ])
  })

  it("RA allows read and approve, not write", async () => {
    // D1.8: PM is RA
    const person = await addPerson(projectId, ["PM"])

    expect(await answers(person, projectId, "D1.8")).toEqual([
      true,
      false,
      true,
    ])
  })

  it("a dash allows nothing", async () => {
    // D1.8: AE has no access
    const person = await addPerson(projectId, ["AE"])

    expect(await answers(person, projectId, "D1.8")).toEqual([
      false,
      false,
      false,
    ])
  })

  it("gives nothing on a project where the person has no role", async () => {
    const other = await addProject("Conveyor")
    const person = await addPerson(projectId, ["PM"])

    expect(await answers(person, other, "D1.8")).toEqual([false, false, false])
  })

  it("lets two roles add up: PM (RA) and LE (RW) can write and approve D1.8", async () => {
    const person = await addPerson(projectId, ["PM", "LE"])

    expect(await answers(person, projectId, "D1.8")).toEqual([true, true, true])
  })

  it("denies everything for a tool that is not in the table", async () => {
    const person = await addPerson(projectId, ["PM", "LE", "IT/Admin"])

    expect(await answers(person, projectId, "D99.9")).toEqual([
      false,
      false,
      false,
    ])
  })

  it("denies everything for a person who does not exist", async () => {
    expect(
      await answers("00000000-0000-0000-0000-000000000000", projectId, "D1.8")
    ).toEqual([false, false, false])
  })
})

describe("every row of the matrix", () => {
  const expected = {
    RW: [true, true, false],
    RO: [true, false, false],
    RA: [true, false, true],
  } as const

  for (const toolId of Object.keys(permissionMatrix)) {
    it(`${toolId} gives each of the 19 roles exactly its access`, () => {
      for (const role of roles) {
        const access = accessRow(toolId)?.[role]
        const want = access ? expected[access] : [false, false, false]

        expect(
          actions.map((action) => roleAllows([role], toolId, action))
        ).toEqual(want)
      }
    })
  }
})

describe("assertCan", () => {
  it("returns quietly when allowed", async () => {
    const person = await addPerson(projectId, ["LE"])

    await expect(
      assertCan(database, person, projectId, "D1.8", "write")
    ).resolves.toBeUndefined()
  })

  it("throws PermissionDeniedError when not allowed", async () => {
    const person = await addPerson(projectId, ["OM"])

    await expect(
      assertCan(database, person, projectId, "D1.8", "write")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("assertHoldsRole", () => {
  it("returns quietly for a person who holds the role on the project", async () => {
    const person = await addPerson(projectId, ["LE", "PM"])

    await expect(
      assertHoldsRole(database, person, projectId, "PM")
    ).resolves.toBeUndefined()
  })

  it("throws PermissionDeniedError for every other role", async () => {
    const person = await addPerson(
      projectId,
      roles.filter((role) => role !== "PM")
    )

    await expect(
      assertHoldsRole(database, person, projectId, "PM")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("throws PermissionDeniedError for the role on another project", async () => {
    const person = await addPerson(await addProject("Kiln"), ["PM"])

    await expect(
      assertHoldsRole(database, person, projectId, "PM")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("company-wide roles", () => {
  async function holdCompanyWide(personId: string, role: Role) {
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [personId, role]
    )
  }

  it("counts on a project created after the role was given", async () => {
    const om = await addPerson(projectId, [])
    await holdCompanyWide(om, "OM")

    const inquiry = await addProject("New inquiry")

    expect(await answers(om, inquiry, "D1.2")).toEqual([true, true, false])
  })

  it("adds up with the roles held on the project", async () => {
    const person = await addPerson(projectId, ["LE"])
    await holdCompanyWide(person, "OM")

    expect(await rolesOn(database, person, projectId)).toEqual(
      expect.arrayContaining(["LE", "OM"])
    )
    expect(await can(database, person, projectId, "D1.2", "write")).toBe(true)
    expect(await can(database, person, projectId, "D1.8", "write")).toBe(
      roleAllows(["LE"], "D1.8", "write")
    )
  })

  it("lists a role once when it is held both ways", async () => {
    const person = await addPerson(projectId, ["PM"])
    await holdCompanyWide(person, "PM")

    expect(await rolesOn(database, person, projectId)).toEqual(["PM"])
  })

  it("gives nothing on a project that does not exist", async () => {
    const person = await addPerson(projectId, [])
    await holdCompanyWide(person, "OM")

    expect(
      await rolesOn(database, person, "00000000-0000-0000-0000-000000000000")
    ).toEqual([])
  })

  it("satisfies assertHoldsRole on every project", async () => {
    const person = await addPerson(projectId, [])
    await holdCompanyWide(person, "PM")

    await expect(
      assertHoldsRole(database, person, await addProject("Kiln"), "PM")
    ).resolves.toBeUndefined()
  })

  it("is gone on the next check once removed", async () => {
    const om = await addPerson(projectId, [])
    await holdCompanyWide(om, "OM")

    expect(await can(database, om, projectId, "D1.2", "write")).toBe(true)

    await database.pool.query(
      "DELETE FROM person_company_roles WHERE person_id = $1",
      [om]
    )

    expect(await can(database, om, projectId, "D1.2", "write")).toBe(false)
  })
})

describe("companyRolesOf", () => {
  it("returns only the roles held company-wide", async () => {
    const person = await addPerson(projectId, ["LE"])

    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, 'FO')",
      [person]
    )

    expect(await companyRolesOf(database, person)).toEqual(["FO"])
  })
})

describe("Tier 3 tools", () => {
  it("lets an LE read and approve T3.D1.8a but not write it", async () => {
    const le = await addPerson(projectId, ["LE"])

    expect(await answers(le, projectId, "T3.D1.8a")).toEqual([
      true,
      false,
      true,
    ])
  })

  it("lets an AE write T3.D1.8a", async () => {
    const ae = await addPerson(projectId, ["AE"])

    expect(await answers(ae, projectId, "T3.D1.8a")).toEqual([
      true,
      true,
      false,
    ])
  })

  it("refuses a Client on T3.D1.8a", async () => {
    const client = await addPerson(projectId, ["Client"])

    expect(await answers(client, projectId, "T3.D1.8a")).toEqual([
      false,
      false,
      false,
    ])
  })

  it("lets an OM write T3.D1.3a, as for D1.3", async () => {
    const om = await addPerson(projectId, ["OM"])

    expect(await answers(om, projectId, "T3.D1.3a")).toEqual(
      await answers(om, projectId, "D1.3")
    )
    expect(await can(database, om, projectId, "T3.D1.3a", "write")).toBe(true)
  })
})
