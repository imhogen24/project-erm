import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"
import { createAuth } from "@/server/auth/auth"
import { validateRecord } from "@/server/records/validate"
import { availableTools } from "@/server/workflow/workflow"
import { tools } from "@/server/tools/registry"

import { registerAllTools } from "@/workbooks"
import { listProjectsFor } from "@/server/projects/projects"
import { projectsNeedingTeam } from "@/server/staff/team"
import { workloadOf } from "@/server/staff/staff"

import { emailOf, loginFor, staff } from "./seed-data/people"
import {
  CURRENT_TOOL,
  NEEDS_TEAM,
  currentToolFor,
  client,
  projects as seedProjects,
  toolProjectName,
} from "./seed-data/projects"
import { projectRecords } from "./seed-data/records"
import { seed } from "./seed-users"

registerAllTools(tools)

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const url = process.env.TEST_DATABASE_URL!

const PEOPLE = staff.length + 1

const ADMIN = emailOf("itadmin")

const FILL_IN = toolProjectName("Tier_1", "open")

async function count(
  table: "people" | "projects" | "person_project_roles" | "person_company_roles"
) {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

async function idOf(email: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM people WHERE email = $1",
    [email]
  )

  return rows[0]!.id
}

async function projectIdOf(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE name = $1",
    [name]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("the people", () => {
  it("adds one person per role, each at the role's address, and one client", async () => {
    const created = await seed(url)

    expect(await count("people")).toBe(PEOPLE)
    expect(created).toHaveLength(PEOPLE)
    expect(created).toContainEqual({ role: "QA", email: "qa@imhogen.test" })
    expect(created).toContainEqual({ role: "OM", email: "om@imhogen.test" })
    expect(created.filter((person) => person.role === "Client")).toEqual([
      { role: "Client", email: client.email },
    ])
  })

  it("holds IT/Admin company-wide and gives the assignable roles as qualifications", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{ role: string; n: string }>(
      `SELECT role, count(*) AS n FROM person_company_roles GROUP BY role`
    )

    const held = Object.fromEntries(
      rows.map((row) => [row.role, Number(row.n)])
    )

    expect(held).toEqual({
      "IT/Admin": 1,
      PM: 1,
      OM: 1,
      FO: 1,
      LE: 1,
      AE: 1,
      HE: 1,
    })
  })

  it("uses no demo names and no example.com addresses", async () => {
    await seed(url)

    const { rows } = await database.pool.query(
      `SELECT name, email FROM people
        WHERE name ILIKE '%demo%' OR email ILIKE '%example.com'`
    )

    expect(rows).toEqual([])
  })

  it(
    "lets every one of them sign in with the password `password`",
    {
      timeout: 30_000,
    },
    async () => {
      await seed(url)

      const { rows } = await database.pool.query<{ email: string }>(
        "SELECT email FROM people"
      )

      for (const { email } of rows) {
        const result = await auth.api.signInEmail({
          body: { email, password: "password" },
        })

        expect(result.user.email).toBe(email)
      }
    }
  )
})

describe("the projects", () => {
  it("adds every project, each with its website request and a request ID made from when it arrived", async () => {
    await seed(url)

    expect(await count("projects")).toBe(seedProjects.length)

    const { rows } = await database.pool.query<{
      request_id: string
      submission_id: string
      email: string
    }>(
      `SELECT p.request_id, i.request_id AS submission_id, i.submission->>'email' AS email
         FROM projects p
         JOIN intake_submissions i ON i.project_id = p.id`
    )

    expect(rows).toHaveLength(seedProjects.length)

    for (const row of rows) {
      expect(row.request_id).toBe(row.submission_id)
      expect(row.request_id).toMatch(/^T[13]-\d{13}$/)
      expect(row.email).toBe(client.email)
    }
  })

  it("puts every role on the tool's projects, and the client", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{ role: string }>(
      `SELECT DISTINCT role FROM person_project_roles WHERE project_id = $1`,
      [await projectIdOf(FILL_IN)]
    )

    expect(rows).toHaveLength(18)
  })

  it(`has every tool before ${CURRENT_TOOL} locked on Fill in, so ${CURRENT_TOOL} is open and not started`, async () => {
    await seed(url)

    const project = await projectIdOf(FILL_IN)

    const { rows } = await database.pool.query<{
      tool_id: string
      state: string
    }>(`SELECT tool_id, state FROM tool_records WHERE project_id = $1`, [
      project,
    ])

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.state === "locked")).toBe(true)
    expect(rows.map((row) => row.tool_id)).not.toContain(CURRENT_TOOL)

    const open = (await availableTools(database, project)).map(
      (tool) => tool.toolId
    )

    expect(open).toContain(CURRENT_TOOL)
  })

  it(`has ${CURRENT_TOOL} submitted by the LE on Approve, and approved by the PM on Approved`, async () => {
    await seed(url)

    const { rows } = await database.pool.query(
      `SELECT pr.name, r.state,
              (SELECT p.email FROM people p WHERE p.id = r.submitted_by) AS prepared,
              (SELECT p.email FROM people p WHERE p.id = r.approved_by) AS approved
         FROM tool_records r
         JOIN projects pr ON pr.id = r.project_id
        WHERE r.tool_id = $1 AND pr.name LIKE $2
        ORDER BY pr.name`,
      [CURRENT_TOOL, `%${CURRENT_TOOL} Tier 1%`]
    )

    expect(rows).toEqual([
      {
        name: toolProjectName("Tier_1", "submitted"),
        state: "submitted",
        prepared: loginFor("LE"),
        approved: null,
      },
      {
        name: toolProjectName("Tier_1", "locked"),
        state: "locked",
        prepared: loginFor("LE"),
        approved: loginFor("PM"),
      },
    ])
  })

  it(`opens ${currentToolFor("Tier_3")} on the Tier 3 Fill in, and never D1.3 or D1.8`, async () => {
    await seed(url)

    const open = (
      await availableTools(
        database,
        await projectIdOf(toolProjectName("Tier_3", "open"))
      )
    ).map((tool) => tool.toolId)

    expect(open).toContain(currentToolFor("Tier_3"))
    expect(open).not.toContain("D1.3")
    expect(open).not.toContain("D1.8")
  })
})

describe("the records", () => {
  it("are each valid for their tool, as a draft or as the OM submitted it", () => {
    for (const [name, records] of projectRecords) {
      for (const record of records) {
        // Approved is written by the system when the PM approves, so the OM
        // submitted Reviewed in its place.
        const submitted = JSON.parse(
          JSON.stringify(record.payload).replaceAll('"Approved"', '"Reviewed"')
        )

        // What the system writes, such as D1.4's delivery status, the times
        // D1.5 sent or the meeting D1.6 copied from D1.5, is never typed, so
        // it is not checked as typed.
        for (const field of tools.getTool(record.toolId)?.fields ?? []) {
          if (
            field.systemFilled ||
            field.inherited ||
            // Written by signing, never typed.
            field.type === "signature" ||
            (field.type === "table" && field.readOnly)
          ) {
            delete submitted[field.key]
          }

          // A row's worked-out total, such as D1.14's, is the system's too.
          if (field.type === "table" && Array.isArray(submitted[field.key])) {
            for (const column of field.columns) {
              if (column.systemFilled) {
                for (const row of submitted[field.key]) {
                  delete row[column.key]
                }
              }
            }
          }
        }

        const result = validateRecord(record.toolId, submitted, {
          forSubmit: record.state !== "draft",
        })

        expect({ name, toolId: record.toolId, ...result }).toMatchObject({
          ok: true,
        })
      }
    }
  })

  it("run in order: only the last record of a project is still open", () => {
    for (const records of projectRecords.values()) {
      const states = records.map((record) => record.state)

      expect(states.slice(0, -1).every((state) => state === "locked")).toBe(
        true
      )
    }
  })
})

describe("what the PMs see", () => {
  it("gives each PM a record to approve or a change to decide, with an unread note for it", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{
      email: string
      kind: string
    }>(
      `SELECT p.email, n.kind
         FROM notifications n
         JOIN people p ON p.id = n.person_id
        WHERE n.read_at IS NULL
        ORDER BY p.email, n.kind`
    )

    expect(rows).toEqual([
      { email: loginFor("PM"), kind: "approval_needed" },
      { email: loginFor("PM"), kind: "approval_needed" },
      { email: loginFor("PM"), kind: "change_waiting" },
    ])
  })

  it("has one change request waiting, on D1.1 of the approved project, asked by its OM", async () => {
    await seed(url)

    const { rows } = await database.pool.query(
      `SELECT r.tool_id, c.status, p.email
         FROM change_requests c
         JOIN tool_records r ON r.id = c.record_id
         JOIN people p ON p.id = c.requested_by`
    )

    expect(rows).toEqual([
      {
        tool_id: "D1.1",
        status: "requested",
        email: loginFor("OM"),
      },
    ])
  })

  it("adds no second change request or note when it runs again", async () => {
    await seed(url)

    const before = await database.pool.query(
      "SELECT (SELECT count(*) FROM notifications) AS n, (SELECT count(*) FROM change_requests) AS c"
    )

    await seed(url)

    const after = await database.pool.query(
      "SELECT (SELECT count(*) FROM notifications) AS n, (SELECT count(*) FROM change_requests) AS c"
    )

    expect(after.rows).toEqual(before.rows)
  })
})

describe("what the IT/Admin sees", () => {
  it("sees every project", async () => {
    await seed(url)

    const listed = await listProjectsFor(database, await idOf(ADMIN))

    expect(listed.map((project) => project.name).sort()).toEqual(
      seedProjects.map((project) => project.name).sort()
    )
  })

  it("lists the running projects short of a PM or an OM, and no others", async () => {
    await seed(url)

    const needing = await projectsNeedingTeam(database, await idOf(ADMIN))

    expect(needing.map((project) => project.name)).toEqual([NEEDS_TEAM])
  })

  it("keeps everyone free to take the project that needs a team", async () => {
    await seed(url)

    const admin = await idOf(ADMIN)

    for (const person of staff) {
      for (const load of await workloadOf(
        database,
        admin,
        await idOf(emailOf(person.handle))
      )) {
        expect(load.count).toBeLessThan(load.limit)
      }
    }
  })
})

describe("what the other roles see", () => {
  it("shows the PM every project but the one waiting for a team", async () => {
    await seed(url)

    const listed = await listProjectsFor(database, await idOf(loginFor("PM")))

    expect(listed.map((project) => project.name).sort()).toEqual(
      seedProjects
        .map((project) => project.name)
        .filter((name) => name !== NEEDS_TEAM)
        .sort()
    )
  })
})

describe("seeding again", () => {
  it("changes nothing and creates no one", async () => {
    await seed(url)

    const roles = await count("person_project_roles")
    const created = await seed(url)

    expect(created).toEqual([])
    expect(await count("projects")).toBe(seedProjects.length)
    expect(await count("people")).toBe(PEOPLE)
    expect(await count("person_project_roles")).toBe(roles)
  })

  it("adds back only a person who was deleted", async () => {
    await seed(url)
    await database.pool.query("DELETE FROM people WHERE email = $1", [
      emailOf("qa"),
    ])

    const created = await seed(url)

    expect(created).toEqual([{ role: "QA", email: emailOf("qa") }])
    expect(await count("people")).toBe(PEOPLE)
  })

  it("gives back a lost password, a lost role and a lost qualification", async () => {
    await seed(url)

    const roles = await count("person_project_roles")
    const qualifications = await count("person_company_roles")
    const email = emailOf("pm")

    await database.pool.query(
      "DELETE FROM accounts WHERE person_id = (SELECT id FROM people WHERE email = $1)",
      [email]
    )
    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = (SELECT id FROM people WHERE email = $1)",
      [email]
    )
    await database.pool.query(
      "DELETE FROM person_company_roles WHERE person_id = (SELECT id FROM people WHERE email = $1)",
      [email]
    )

    expect(await seed(url)).toEqual([])
    expect(await count("people")).toBe(PEOPLE)
    expect(await count("person_project_roles")).toBe(roles)
    expect(await count("person_company_roles")).toBe(qualifications)

    const result = await auth.api.signInEmail({
      body: { email, password: "password" },
    })

    expect(result.user.email).toBe(email)
  })

  it("leaves a record someone is working on alone", async () => {
    await seed(url)

    const project = await projectIdOf(FILL_IN)

    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE tool_id = 'D1.2' AND project_id = $1",
      [project]
    )
    await seed(url)

    const { rows } = await database.pool.query<{ state: string }>(
      "SELECT state FROM tool_records WHERE tool_id = 'D1.2' AND project_id = $1",
      [project]
    )

    expect(rows).toEqual([{ state: "draft" }])
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
