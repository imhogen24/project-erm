import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createAuth } from "@/server/auth/auth"

import {
  AdminExistsError,
  InvalidInviteInputError,
  InviteExpiredError,
  InviteUsedError,
  acceptInvite,
  createFirstAdminInvite,
} from "./invites"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const options = { baseURL: "https://erm.example.com/" }

const PASSWORD = "correct-horse-battery"

function firstAdmin(email = "kofi@example.com", name = "Kofi Boateng") {
  return createFirstAdminInvite(database, { email, name }, options)
}

function tokenOf(link: string) {
  return link.split("/invite/")[1]!
}

async function count(table: "people" | "invitations" | "projects") {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

async function companyRolesOf(email: string) {
  const { rows } = await database.pool.query<{ role: string }>(
    `SELECT r.role FROM person_company_roles r
     JOIN people p ON p.id = r.person_id
     WHERE p.email = $1`,
    [email]
  )

  return rows.map((row) => row.role)
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("the first IT/Admin", () => {
  it("on an empty system prints a link on the app's address, and adds no project", async () => {
    const { link } = await firstAdmin()

    expect(link).toMatch(/^https:\/\/erm\.example\.com\/invite\/[\w-]+$/)
    expect(await count("invitations")).toBe(1)
    expect(await count("projects")).toBe(0)
  })

  it("accepting the link lets them sign in, holding IT/Admin company-wide", async () => {
    const { link } = await firstAdmin()

    await acceptInvite(database, tokenOf(link), PASSWORD)

    const session = await auth.api.signInEmail({
      body: { email: "kofi@example.com", password: PASSWORD },
    })

    expect(session.user.email).toBe("kofi@example.com")
    expect(await companyRolesOf("kofi@example.com")).toEqual(["IT/Admin"])
  })

  it("is refused once an IT/Admin exists, and adds nothing", async () => {
    const { link } = await firstAdmin()

    await acceptInvite(database, tokenOf(link), PASSWORD)

    await expect(firstAdmin("ama@example.com")).rejects.toThrow(
      AdminExistsError
    )
    expect(await count("invitations")).toBe(1)
  })

  it("refuses a missing name or a bad email, and adds nothing", async () => {
    await expect(firstAdmin("not-an-email")).rejects.toThrow(
      InvalidInviteInputError
    )
    await expect(firstAdmin("kofi@example.com", " ")).rejects.toThrow(
      InvalidInviteInputError
    )
    expect(await count("invitations")).toBe(0)
  })

  it("run twice gives a fresh link, the earlier one stops working, and nobody is duplicated", async () => {
    const first = await firstAdmin()
    const second = await firstAdmin()

    expect(second.link).not.toBe(first.link)
    await expect(
      acceptInvite(database, tokenOf(first.link), PASSWORD)
    ).rejects.toThrow(InviteExpiredError)

    await acceptInvite(database, tokenOf(second.link), PASSWORD)

    const { rows } = await database.pool.query(
      "SELECT id FROM people WHERE email = 'kofi@example.com'"
    )

    expect(rows).toHaveLength(1)
  })

  it("a link from a run with another email stops working too", async () => {
    const first = await firstAdmin("kofi@example.com")

    await firstAdmin("ama@example.com")

    await expect(
      acceptInvite(database, tokenOf(first.link), PASSWORD)
    ).rejects.toThrow(InviteExpiredError)
  })

  it("logs each link it withdraws, and each it makes", async () => {
    await firstAdmin("kofi@example.com")
    await firstAdmin("ama@example.com")

    const { rows } = await database.pool.query<{
      action: string
      email: string
    }>(
      "SELECT action, email FROM access_log ORDER BY created_at, action = 'invited'"
    )

    expect(rows).toEqual([
      { action: "invited", email: "kofi@example.com" },
      { action: "invite_withdrawn", email: "kofi@example.com" },
      { action: "invited", email: "ama@example.com" },
    ])
  })

  it("the link works only once", async () => {
    const { link } = await firstAdmin()

    await acceptInvite(database, tokenOf(link), PASSWORD)

    await expect(
      acceptInvite(database, tokenOf(link), PASSWORD)
    ).rejects.toThrow(InviteUsedError)
  })

  it("two runs at once open only one usable link", async () => {
    const [one, two] = await Promise.all([
      firstAdmin("kofi@example.com"),
      firstAdmin("ama@example.com"),
    ])

    const { rows } = await database.pool.query(
      "SELECT id FROM invitations WHERE expires_at > now()"
    )

    expect(rows).toHaveLength(1)
    expect(one.link).not.toBe(two.link)
  })
})
