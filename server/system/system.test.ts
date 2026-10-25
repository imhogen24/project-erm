import { randomBytes } from "node:crypto"

import { migrate } from "drizzle-orm/node-postgres/migrator"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createDatabase } from "@/db"
import { migrationsSchema, migrationsTable } from "@/db/migration-history"
import { systemPerson } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createAuth } from "@/server/auth/auth"
import {
  InvalidCompanyRoleError,
  giveCompanyRoles,
} from "@/server/company-roles/company-roles"
import { InvalidInviteInputError, createInvite } from "@/server/invites/invites"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ProjectNotActiveError,
  RecordNotEditableError,
  ToolNotAvailableError,
  ValidationError,
  createRecord,
  transitionRecord,
  updateRecord,
} from "@/server/records/records"
import { registerTestTools } from "@/server/tools/testing"

import { systemActor } from "./system"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

// The real workflow map is in force: D1.1 opens on a new project, and D1.2
// waits for D1.1 to be locked.
registerTestTools({ wb01: ["D1.1", "D1.2"] })

let projectId: string

async function addProject(status = "active") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track, status) VALUES ('Boiler', $1, 'Tier_1', $2) RETURNING id",
    [`T1-${crypto.randomUUID()}`, status]
  )

  return rows[0]!.id
}

// Inserted directly, so a test can pick the state without a person moving it.
async function addRecord(state: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state) VALUES ($1, 'D1.1', $2) RETURNING id",
    [projectId, state]
  )

  return rows[0]!.id
}

async function addItAdmin() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Admin', $1) RETURNING id",
    [`admin-${Math.random()}@example.com`]
  )

  await database.pool.query(
    "INSERT INTO person_company_roles (person_id, role) VALUES ($1, 'IT/Admin')",
    [rows[0]!.id]
  )

  return rows[0]!.id
}

function createAsSystem(toolId = "D1.1", payload = {}) {
  return createRecord(database, systemActor, { projectId, toolId, payload })
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  projectId = await addProject()
})

afterAll(async () => {
  await database.pool.end()
})

describe("the system writing records", () => {
  it("creates D1.1 on a new project, and the audit log names the system", async () => {
    const record = await createAsSystem("D1.1", { note: "From the website" })

    expect(record.state).toBe("draft")

    const { rows } = await database.pool.query(
      `SELECT DISTINCT audit_log.actor_id, people.name
         FROM audit_log JOIN people ON people.id = audit_log.actor_id
        WHERE audit_log.record_id = $1`,
      [record.id]
    )

    expect(rows).toEqual([{ actor_id: systemActor, name: "System" }])
  })

  it("can edit and submit its own draft", async () => {
    const record = await createAsSystem()

    await updateRecord(database, systemActor, record.id, { note: "Fixed" })

    const moved = await transitionRecord(
      database,
      systemActor,
      record.id,
      "submitted"
    )

    expect(moved.state).toBe("submitted")
  })

  it("cannot create a tool the workflow has not opened", async () => {
    await expect(createAsSystem("D1.2")).rejects.toThrow(ToolNotAvailableError)
  })

  it("cannot create a record with a field the tool does not have", async () => {
    await expect(createAsSystem("D1.1", { notAField: "x" })).rejects.toThrow(
      ValidationError
    )
  })

  it("cannot create a record on a rejected project", async () => {
    projectId = await addProject("rejected")

    await expect(createAsSystem()).rejects.toThrow(ProjectNotActiveError)
  })

  it("cannot approve a submitted record", async () => {
    const record = await createAsSystem()

    await transitionRecord(database, systemActor, record.id, "submitted")

    await expect(
      transitionRecord(database, systemActor, record.id, "approved")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("cannot lock an approved record", async () => {
    const recordId = await addRecord("approved")

    await expect(
      transitionRecord(database, systemActor, recordId, "locked")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("cannot edit a locked record", async () => {
    const recordId = await addRecord("locked")

    await expect(
      updateRecord(database, systemActor, recordId, { note: "Changed" })
    ).rejects.toThrow(RecordNotEditableError)
  })
})

describe("signing in as the system", () => {
  it("is refused with its email", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: systemPerson.email, password: "password" },
      })
    ).rejects.toThrow()
  })

  it("is refused a password, even one written straight to the database", async () => {
    await expect(
      database.pool.query(
        "INSERT INTO accounts (person_id, account_id, provider_id, password) VALUES ($1, $2, 'credential', 'hash')",
        [systemActor, systemActor]
      )
    ).rejects.toThrow(/accounts_not_system/)
  })

  it("is refused a session, even one written straight to the database", async () => {
    await expect(
      database.pool.query(
        "INSERT INTO sessions (person_id, token, expires_at) VALUES ($1, 'token', now() + interval '1 day')",
        [systemActor]
      )
    ).rejects.toThrow(/sessions_not_system/)
  })
})

describe("giving the system access", () => {
  it.each([
    ["on a project", true],
    ["company-wide", false],
  ])("refuses an invite %s", async (_, onProject) => {
    const admin = await addItAdmin()

    await expect(
      createInvite(
        database,
        admin,
        {
          email: systemPerson.email.toUpperCase(),
          name: "System",
          projectId: onProject ? projectId : null,
          roles: ["OM"],
        },
        { baseURL: "http://localhost:3000" }
      )
    ).rejects.toThrow(InvalidInviteInputError)
  })

  it("refuses company-wide roles", async () => {
    const admin = await addItAdmin()

    await expect(
      giveCompanyRoles(database, admin, systemActor, ["OM"])
    ).rejects.toThrow(InvalidCompanyRoleError)
  })

  it("refuses a project role written straight to the database", async () => {
    await expect(
      database.pool.query(
        "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'OM')",
        [systemActor, projectId]
      )
    ).rejects.toThrow(/person_project_roles_not_system/)
  })

  it("refuses a company-wide role written straight to the database", async () => {
    await expect(
      database.pool.query(
        "INSERT INTO person_company_roles (person_id, role) VALUES ($1, 'OM')",
        [systemActor]
      )
    ).rejects.toThrow(/person_company_roles_not_system/)
  })
})

describe("the system person", () => {
  it("is made by the migrations on an empty database", async () => {
    const name = `erm_fresh_${randomBytes(4).toString("hex")}`
    const url = new URL(process.env.TEST_DATABASE_URL!)

    url.pathname = `/${name}`

    await database.pool.query(`CREATE DATABASE ${name}`)

    const fresh = createDatabase(url.toString())

    try {
      await migrate(fresh, {
        migrationsFolder: "./db/migrations",
        migrationsSchema,
        migrationsTable,
      })

      const { rows } = await fresh.pool.query(
        "SELECT name, email FROM people WHERE id = $1",
        [systemActor]
      )

      expect(rows).toEqual([
        { name: systemPerson.name, email: systemPerson.email },
      ])
    } finally {
      await fresh.pool.end()
      await database.pool.query(`DROP DATABASE ${name}`)
    }
  }, 30_000)
})
