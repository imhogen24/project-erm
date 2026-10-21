import { APIError } from "better-auth/api"
import { hashPassword } from "better-auth/crypto"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"

import { createAuth } from "./auth"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const EMAIL = "ama@example.com"

const PASSWORD = "correct-horse-battery"

// Sign-up is switched off, so a test person is inserted directly.
async function addPerson(email = EMAIL, password = PASSWORD) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [email]
  )

  const personId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO accounts (person_id, account_id, provider_id, password) VALUES ($1, $2, 'credential', $3)",
    [personId, personId, await hashPassword(password)]
  )

  return personId
}

async function count(table: "people" | "sessions") {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

async function signIn(email: string, password: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })

  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

async function failure(email: string, password: string) {
  try {
    await auth.api.signInEmail({ body: { email, password } })
  } catch (error) {
    if (error instanceof APIError) {
      return { status: error.status, body: error.body }
    }
  }

  return undefined
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("signing in", () => {
  it("lets a person with the right email and password in and creates a session", async () => {
    const personId = await addPerson()

    const cookie = await signIn(EMAIL, PASSWORD)

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    })

    expect(session?.user.id).toBe(personId)
    expect(await count("sessions")).toBe(1)
  })

  it("refuses a wrong password and creates no session", async () => {
    await addPerson()

    expect(await failure(EMAIL, "wrong-password")).toBeDefined()
    expect(await count("sessions")).toBe(0)
  })

  it("refuses an email with no account", async () => {
    expect(await failure("nobody@example.com", PASSWORD)).toBeDefined()
    expect(await count("sessions")).toBe(0)
  })

  it("gives the same error for a wrong password and an unknown email", async () => {
    await addPerson()

    const wrongPassword = await failure(EMAIL, "wrong-password")
    const unknownEmail = await failure("nobody@example.com", PASSWORD)

    expect(wrongPassword).toBeDefined()
    expect(wrongPassword).toEqual(unknownEmail)
  })

  it("matches the email without caring about capital letters", async () => {
    await addPerson()

    const cookie = await signIn("AMA@Example.com", PASSWORD)

    expect(cookie).not.toBe("")
  })
})

describe("signing up", () => {
  it("is refused, and no one is added to people", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Eve", email: "eve@example.com", password: PASSWORD },
      })
    ).rejects.toThrow()

    expect(await count("people")).toBe(0)
  })
})

describe("signing out", () => {
  it("ends the session", async () => {
    await addPerson()

    const cookie = await signIn(EMAIL, PASSWORD)
    const headers = new Headers({ cookie })

    await auth.api.signOut({ headers })

    expect(await auth.api.getSession({ headers })).toBeNull()
    expect(await count("sessions")).toBe(0)
  })

  it("leaves other people's sessions alone", async () => {
    await addPerson()
    await addPerson("kofi@example.com")

    const ama = await signIn(EMAIL, PASSWORD)
    const kofi = await signIn("kofi@example.com", PASSWORD)

    await auth.api.signOut({ headers: new Headers({ cookie: ama }) })

    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: kofi }) })
    ).not.toBeNull()
  })
})
