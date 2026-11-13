import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"
import { createAuth } from "@/server/auth/auth"
import { validateRecord } from "@/server/records/validate"
import { availableTools } from "@/server/workflow/workflow"
import { tools } from "@/server/tools/registry"

import { registerAllTools } from "@/workbooks"
import { listProjectsFor } from "@/server/projects/projects"
import { projectsNeedingTeam, teamOf } from "@/server/staff/team"
import { workloadOf } from "@/server/staff/staff"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { emailOf, loginFor, staff } from "./seed-data/people"
import {
  featuredProject,
  featuredTier3Project,
  projects as seedProjects,
  requestIdOf,
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

// The Dev projects share one client, so clients are counted by address.
const CLIENTS = new Set(seedProjects.map((project) => project.client.email))
  .size

const PEOPLE = staff.length + CLIENTS

const ADMIN = emailOf("kofi.mensah")

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
  it("adds IMHOGEN's staff and one client for each project", async () => {
    const created = await seed(url)

    expect(await count("people")).toBe(PEOPLE)
    expect(created).toHaveLength(PEOPLE)
    expect(created).toContainEqual({
      role: "QA",
      email: emailOf("mavis.hammond"),
    })
    expect(created.filter((person) => person.role === "Client")).toHaveLength(
      CLIENTS
    )
  })

  it("holds IT/Admin company-wide and gives the assignable roles as qualifications", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{ role: string; n: string }>(
      `SELECT role, count(*) AS n FROM person_company_roles GROUP BY role`
    )

    const held = Object.fromEntries(
      rows.map((row) => [row.role, Number(row.n)])
    )

    expect(held["IT/Admin"]).toBe(1)
    expect(held.PM).toBe(4)
    expect(held.OM).toBe(3)
    expect(held.FO).toBe(2)
    expect(held.LE).toBe(3)
    expect(held.AE).toBe(2)
    expect(held.HE).toBe(1)
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
         JOIN intake_submissions i ON i.project_id = p.id
        ORDER BY p.created_at`
    )

    expect(rows).toHaveLength(seedProjects.length)

    for (const row of rows) {
      expect(row.request_id).toBe(row.submission_id)
      expect(row.request_id).toMatch(/^T[13]-\d{13}$/)
    }

    expect(rows.map((row) => row.request_id)).toContain(
      requestIdOf(featuredProject)
    )
  })

  it("covers both tracks and every status a project can be in", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{ k: string }>(
      `SELECT DISTINCT service_track::text AS k FROM projects
       UNION SELECT DISTINCT status::text FROM projects`
    )

    expect(rows.map((row) => row.k).sort()).toEqual([
      "Tier_1",
      "Tier_3",
      "active",
      "closed",
      "completed",
      "on_hold",
      "rejected",
    ])
  })

  it("puts every role on the featured project, and its client", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{ role: string }>(
      `SELECT DISTINCT role FROM person_project_roles WHERE project_id = $1`,
      [await projectIdOf(featuredProject.name)]
    )

    expect(rows).toHaveLength(18)
  })

  it("has D1.1 to D1.8 locked on the featured project, so D1.9 is open", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{
      tool_id: string
      state: string
    }>(
      `SELECT tool_id, state FROM tool_records WHERE project_id = $1 ORDER BY tool_id`,
      [await projectIdOf(featuredProject.name)]
    )

    expect(rows).toEqual([
      { tool_id: "D1.1", state: "locked" },
      { tool_id: "D1.2", state: "locked" },
      { tool_id: "D1.3", state: "locked" },
      { tool_id: "D1.4", state: "locked" },
      { tool_id: "D1.5", state: "locked" },
      { tool_id: "D1.6", state: "locked" },
      { tool_id: "D1.7", state: "locked" },
      { tool_id: "D1.8", state: "locked" },
    ])

    const open = (
      await availableTools(database, await projectIdOf(featuredProject.name))
    ).map((tool) => tool.toolId)

    expect(open).toContain("D1.9")
  })
})

describe("the Tier 3 working project", () => {
  it("is active and staffed, with D1.1 to T3.D1.8a locked so D1.9 is open, and never D1.3 or D1.8", async () => {
    await seed(url)

    const project = await projectIdOf(featuredTier3Project.name)

    const { rows } = await database.pool.query(
      `SELECT p.service_track, p.status,
              (SELECT string_agg(tool_id || ':' || state, ',' ORDER BY tool_id)
                 FROM tool_records WHERE project_id = p.id) AS records
         FROM projects p WHERE p.id = $1`,
      [project]
    )

    expect(rows).toEqual([
      {
        service_track: "Tier_3",
        status: "active",
        records:
          "D1.1:locked,D1.2:locked,D1.4:locked,T3.D1.3a:locked,T3.D1.8a:locked",
      },
    ])

    const open = (await availableTools(database, project)).map(
      (tool) => tool.toolId
    )

    expect(open).toContain("D1.9")
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

  it("name the OM who prepared each one and the PM who approved the locked ones", async () => {
    await seed(url)

    const { rows } = await database.pool.query<{
      state: string
      prepared: string | null
      approved: string | null
    }>(
      `SELECT r.state,
              (SELECT p.email FROM people p WHERE p.id = r.submitted_by) AS prepared,
              (SELECT p.email FROM people p WHERE p.id = r.approved_by) AS approved
         FROM tool_records r
         JOIN projects pr ON pr.id = r.project_id
        WHERE pr.name = 'Ho Water Treatment Dosing Skid'
        ORDER BY r.created_at`
    )

    expect(rows).toEqual([
      {
        state: "locked",
        prepared: emailOf("selorm.dzigbordi"),
        approved: emailOf("efua.quartey"),
      },
      {
        state: "locked",
        prepared: emailOf("selorm.dzigbordi"),
        approved: emailOf("efua.quartey"),
      },
      {
        state: "submitted",
        prepared: emailOf("selorm.dzigbordi"),
        approved: null,
      },
    ])
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
      { email: emailOf("ama.owusu"), kind: "approval_needed" },
      { email: emailOf("ama.owusu"), kind: "change_waiting" },
      { email: emailOf("efua.quartey"), kind: "approval_needed" },
      { email: emailOf("nana.adjei"), kind: "approval_needed" },
    ])
  })

  it("has one change request waiting, on D1.1 of the featured project, asked by its OM", async () => {
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
        email: emailOf("kwabena.asante"),
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

    expect(needing.map((project) => project.name).sort()).toEqual([
      "Accra Brewery Bottling Retrofit",
      "Kumasi Cocoa Roasting Line",
      "Takoradi Port Conveyor Upgrade",
    ])
  })

  it("shows a team on a staffed project", async () => {
    await seed(url)

    const team = await teamOf(
      database,
      await idOf(ADMIN),
      await projectIdOf("Tamale Shea Butter Processing Plant")
    )

    expect(team?.members.map((member) => member.role)).toEqual([
      "PM",
      "OM",
      "LE",
      "AE",
      "FO",
    ])
  })

  it("keeps everyone within their workload limit, with one engineer at it", async () => {
    await seed(url)

    const admin = await idOf(ADMIN)
    const full: string[] = []

    for (const person of staff) {
      for (const load of await workloadOf(
        database,
        admin,
        await idOf(emailOf(person.handle))
      )) {
        expect(load.count).toBeLessThanOrEqual(load.limit)

        if (load.count === load.limit) {
          full.push(`${person.name}: ${load.group}`)
        }
      }
    }

    expect(full).toContain("Kojo Antwi: Engineer")
  })
})

describe("what the other roles see", () => {
  it("shows the PM only the projects they are on", async () => {
    await seed(url)

    const listed = await listProjectsFor(database, await idOf(loginFor("PM")))

    expect(listed.map((project) => project.name).sort()).toEqual([
      "Cape Coast Hotel Laundry Boiler",
      `${DEV_LOCKED} (Tier 1)`,
      `${DEV_LOCKED} (Tier 3)`,
      `${DEV_UNLOCKED} (Tier 1)`,
      `${DEV_UNLOCKED} (Tier 3)`,
      "Tamale Shea Butter Processing Plant",
      "Tema Foods Boiler Skid",
    ])
  })

  it("shows a client only their own project", async () => {
    await seed(url)

    const listed = await listProjectsFor(
      database,
      await idOf(featuredProject.client.email)
    )

    expect(listed.map((project) => project.name)).toEqual([
      featuredProject.name,
    ])
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
      emailOf("mavis.hammond"),
    ])

    const created = await seed(url)

    expect(created).toEqual([{ role: "QA", email: emailOf("mavis.hammond") }])
    expect(await count("people")).toBe(PEOPLE)
  })

  it("gives back a lost password, a lost role and a lost qualification", async () => {
    await seed(url)

    const roles = await count("person_project_roles")
    const qualifications = await count("person_company_roles")
    const email = emailOf("ama.owusu")

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

    const project = await projectIdOf(featuredProject.name)

    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE tool_id = 'D1.3' OR (tool_id = 'D1.2' AND project_id = $1)",
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
