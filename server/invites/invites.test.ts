import { createHash } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { createAuth } from "@/server/auth/auth"

import {
  InvalidInviteInputError,
  InviteExpiredError,
  InviteNotFoundError,
  InviteUsedError,
  WeakPasswordError,
  acceptInvite,
  createInvite,
  type InviteInput,
} from "./invites"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const options = { baseURL: "http://localhost:3000" }

const PASSWORD = "correct-horse-battery"

let projectId: string

let otherProjectId: string

let admin: string

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  )

  return rows[0]!.id
}

async function addPerson(email: string, held: [string, Role][] = []) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Existing', $1) RETURNING id",
    [email]
  )

  for (const [project, role] of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, project, role]
    )
  }

  return rows[0]!.id
}

function newInvite(overrides: Partial<InviteInput> = {}) {
  return createInvite(
    database,
    admin,
    {
      email: "kofi@example.com",
      name: "Kofi Boateng",
      projectId,
      roles: ["PM", "LE"],
      ...overrides,
    },
    options
  )
}

// Creates an invite and returns the token from its link.
async function invitedToken(overrides: Partial<InviteInput> = {}) {
  const created = await newInvite(overrides)

  if (created.status !== "invited") {
    throw new Error("Expected an invite, not an added person")
  }

  return created.link.split("/invite/")[1]!
}

async function count(table: "people" | "invitations") {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

async function rolesOf(email: string, project: string) {
  const { rows } = await database.pool.query<{ role: string }>(
    `SELECT r.role FROM person_project_roles r
     JOIN people p ON p.id = r.person_id
     WHERE p.email = $1 AND r.project_id = $2
     ORDER BY r.role::text`,
    [email, project]
  )

  return rows.map((row) => row.role)
}

async function signIn(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password } })
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Boiler")
  otherProjectId = await addProject("Water Tank")

  admin = await addPerson("admin@example.com", [[projectId, "IT/Admin"]])
})

afterAll(async () => {
  await database.pool.end()
})

describe("creating an invite", () => {
  it("stores the invite and returns a link", async () => {
    const created = await newInvite()

    expect(created.status).toBe("invited")

    const { rows } = await database.pool.query(
      "SELECT name, project_id, roles::text[] AS roles, invited_by, accepted_at FROM invitations WHERE email = 'kofi@example.com'"
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe("Kofi Boateng")
    expect(rows[0].project_id).toBe(projectId)
    expect(rows[0].roles).toEqual(["PM", "LE"])
    expect(rows[0].invited_by).toBe(admin)
    expect(rows[0].accepted_at).toBeNull()
  })

  it("expires the invite 7 days from now", async () => {
    await newInvite()

    const { rows } = await database.pool.query<{ days: number }>(
      "SELECT extract(epoch FROM (expires_at - now())) / 86400 AS days FROM invitations"
    )

    expect(Number(rows[0]!.days)).toBeGreaterThan(6.99)
    expect(Number(rows[0]!.days)).toBeLessThan(7.01)
  })

  it("puts a random token in the link and stores only its hash", async () => {
    const created = await newInvite()

    if (created.status !== "invited") {
      throw new Error("Expected an invite")
    }

    const token = created.link.split("/invite/")[1]!

    expect(created.link).toBe(`http://localhost:3000/invite/${token}`)
    expect(token.length).toBeGreaterThanOrEqual(43)

    const { rows } = await database.pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM invitations"
    )

    expect(rows[0]!.token_hash).not.toBe(token)
    expect(rows[0]!.token_hash).toBe(
      createHash("sha256").update(token).digest("hex")
    )

    const stored = await database.pool.query(
      "SELECT 1 FROM invitations WHERE token_hash = $1",
      [token]
    )

    expect(stored.rows).toHaveLength(0)
  })

  it("gives every invite its own token", async () => {
    const first = await invitedToken({ email: "a@example.com" })
    const second = await invitedToken({ email: "b@example.com" })

    expect(first).not.toBe(second)
  })

  it("keeps the email in lower case", async () => {
    await newInvite({ email: "Kofi@Example.COM" })

    const { rows } = await database.pool.query<{ email: string }>(
      "SELECT email FROM invitations"
    )

    expect(rows[0]!.email).toBe("kofi@example.com")
  })

  it("keeps each role once when a role is listed twice", async () => {
    await newInvite({ roles: ["PM", "PM", "LE"] })

    const { rows } = await database.pool.query<{ roles: string[] }>(
      "SELECT roles::text[] AS roles FROM invitations"
    )

    expect(rows[0]!.roles).toEqual(["PM", "LE"])
  })

  it("lets an IT/Admin of one project invite someone to another", async () => {
    await newInvite({ projectId: otherProjectId })

    expect(await count("invitations")).toBe(1)
  })
})

describe("who may invite", () => {
  it("refuses a person who is not an IT/Admin", async () => {
    const pm = await addPerson("pm@example.com", [[projectId, "PM"]])

    await expect(
      createInvite(
        database,
        pm,
        {
          email: "kofi@example.com",
          name: "Kofi",
          projectId,
          roles: ["LE"],
        },
        options
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await count("invitations")).toBe(0)
  })

  it("refuses a person with no roles at all", async () => {
    const nobody = await addPerson("nobody@example.com")

    await expect(
      createInvite(
        database,
        nobody,
        {
          email: "kofi@example.com",
          name: "Kofi",
          projectId,
          roles: ["LE"],
        },
        options
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("what an invite may contain", () => {
  it("refuses an empty role list", async () => {
    await expect(newInvite({ roles: [] })).rejects.toBeInstanceOf(
      InvalidInviteInputError
    )
    expect(await count("invitations")).toBe(0)
  })

  it("refuses a role that is not one of the 19", async () => {
    await expect(newInvite({ roles: ["Owner"] })).rejects.toBeInstanceOf(
      InvalidInviteInputError
    )
    expect(await count("invitations")).toBe(0)
  })

  it("refuses an empty name", async () => {
    await expect(newInvite({ name: "   " })).rejects.toBeInstanceOf(
      InvalidInviteInputError
    )
  })

  it("refuses an email that is not an email", async () => {
    await expect(newInvite({ email: "not-an-email" })).rejects.toBeInstanceOf(
      InvalidInviteInputError
    )
  })
})

describe("accepting an invite", () => {
  it("creates the person with their roles and lets them sign in", async () => {
    const token = await invitedToken()

    const { personId } = await acceptInvite(database, token, PASSWORD)

    const { rows } = await database.pool.query<{ name: string; email: string }>(
      "SELECT name, email FROM people WHERE id = $1",
      [personId]
    )

    expect(rows[0]).toEqual({ name: "Kofi Boateng", email: "kofi@example.com" })
    expect(await rolesOf("kofi@example.com", projectId)).toEqual(["LE", "PM"])

    const session = await signIn("kofi@example.com", PASSWORD)

    expect(session.user.id).toBe(personId)
  })

  it("marks the invite as accepted", async () => {
    const token = await invitedToken()

    await acceptInvite(database, token, PASSWORD)

    const { rows } = await database.pool.query<{ accepted_at: Date | null }>(
      "SELECT accepted_at FROM invitations"
    )

    expect(rows[0]!.accepted_at).toBeInstanceOf(Date)
  })

  it("lets the person sign in whatever capital letters they type", async () => {
    const token = await invitedToken({ email: "Kofi@Example.com" })

    await acceptInvite(database, token, PASSWORD)

    const session = await signIn("KOFI@example.com", PASSWORD)

    expect(session.user.email).toBe("kofi@example.com")
  })

  it("refuses an invite that has expired", async () => {
    const token = await invitedToken()

    await database.pool.query(
      "UPDATE invitations SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'"
    )

    await expect(
      acceptInvite(database, token, PASSWORD)
    ).rejects.toBeInstanceOf(InviteExpiredError)
    expect(await count("people")).toBe(1)
  })

  it("refuses an invite that was already used", async () => {
    const token = await invitedToken()

    await acceptInvite(database, token, PASSWORD)

    await expect(
      acceptInvite(database, token, PASSWORD)
    ).rejects.toBeInstanceOf(InviteUsedError)
    expect(await count("people")).toBe(2)
  })

  it("refuses a token that does not exist", async () => {
    await invitedToken()

    await expect(
      acceptInvite(database, "not-a-real-token", PASSWORD)
    ).rejects.toBeInstanceOf(InviteNotFoundError)
    expect(await count("people")).toBe(1)
  })

  it("refuses a short password and keeps the invite usable", async () => {
    const token = await invitedToken()

    await expect(acceptInvite(database, token, "short")).rejects.toBeInstanceOf(
      WeakPasswordError
    )
    expect(await count("people")).toBe(1)

    await acceptInvite(database, token, PASSWORD)

    expect(await rolesOf("kofi@example.com", projectId)).toEqual(["LE", "PM"])
  })

  it("takes a password of exactly 8 characters and refuses 7", async () => {
    const token = await invitedToken()

    await expect(
      acceptInvite(database, token, "1234567")
    ).rejects.toBeInstanceOf(WeakPasswordError)

    await acceptInvite(database, token, "12345678")

    const session = await signIn("kofi@example.com", "12345678")

    expect(session.user.email).toBe("kofi@example.com")
  })

  it("lets only one of two simultaneous accepts through", async () => {
    const token = await invitedToken()

    const results = await Promise.allSettled([
      acceptInvite(database, token, PASSWORD),
      acceptInvite(database, token, PASSWORD),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await count("people")).toBe(2)
  })

  it("adds the roles to a person who made an account since the invite, and keeps their password", async () => {
    const first = await invitedToken({ projectId, roles: ["PM"] })

    const second = await invitedToken({
      projectId: otherProjectId,
      roles: ["LE"],
    })

    await acceptInvite(database, first, PASSWORD)

    const { personId } = await acceptInvite(
      database,
      second,
      "another-password"
    )

    expect(await rolesOf("kofi@example.com", otherProjectId)).toEqual(["LE"])
    expect(await count("people")).toBe(2)
    expect(personId).toBeDefined()
    await expect(
      signIn("kofi@example.com", "another-password")
    ).rejects.toThrow()
    expect((await signIn("kofi@example.com", PASSWORD)).user.id).toBe(personId)
  })
})

describe("inviting someone who already has an account", () => {
  it("adds the roles straight away and creates no second person", async () => {
    const existing = await addPerson("kofi@example.com", [[projectId, "LE"]])

    const created = await newInvite({
      projectId: otherProjectId,
      roles: ["PM"],
    })

    expect(created).toEqual({ status: "added", personId: existing })
    expect(await rolesOf("kofi@example.com", otherProjectId)).toEqual(["PM"])
    expect(await count("people")).toBe(2)
    expect(await count("invitations")).toBe(0)
  })

  it("finds the person whatever capital letters the email has", async () => {
    await addPerson("kofi@example.com")

    const created = await newInvite({
      email: "KOFI@example.com",
      roles: ["PM"],
    })

    expect(created.status).toBe("added")
    expect(await count("people")).toBe(2)
  })

  it("does not fail when the person already holds the role", async () => {
    await addPerson("kofi@example.com", [[projectId, "PM"]])

    await newInvite({ roles: ["PM", "LE"] })

    expect(await rolesOf("kofi@example.com", projectId)).toEqual(["LE", "PM"])
  })

  it("still refuses someone who is not an IT/Admin", async () => {
    await addPerson("kofi@example.com")

    const pm = await addPerson("pm@example.com", [[projectId, "PM"]])

    await expect(
      createInvite(
        database,
        pm,
        {
          email: "kofi@example.com",
          name: "Kofi",
          projectId,
          roles: ["PM"],
        },
        options
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await rolesOf("kofi@example.com", projectId)).toEqual([])
  })
})
