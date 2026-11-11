import { APIError } from "better-auth/api"
import { hashPassword } from "better-auth/crypto"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport } from "@/server/email/email"

import { createAuth } from "./auth"

const database = createTestDatabase()

const transport = createFakeTransport()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
  transport,
})

const EMAIL = "ama@example.com"

const PASSWORD = "correct-horse-battery"

// A person as an invite makes them: email confirmed, password set.
async function addPerson(email = EMAIL, password = PASSWORD) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email, email_verified) VALUES ('Ama', $1, true) RETURNING id",
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
  await restoreSystemPerson(database)
  transport.sent.length = 0
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

const CLIENT = { name: "Kwaku", email: "kwaku@temafoods.example" }

async function signUp(email = CLIENT.email) {
  return auth.api.signUpEmail({
    body: { name: CLIENT.name, email, password: PASSWORD, callbackURL: "/" },
  })
}

async function personByEmail(email: string) {
  const { rows } = await database.pool.query<{
    id: string
    account_type: string
    email_verified: boolean
  }>("SELECT id, account_type, email_verified FROM people WHERE email = $1", [
    email,
  ])

  return rows[0]
}

// The token in the last link sent to this address.
function lastToken(email: string) {
  const message = transport.sent.findLast((sent) => sent.to === email)
  const link = message?.text.match(/https?:\/\/\S+/)?.[0]

  return new URL(link ?? "http://none").searchParams.get("token") ?? ""
}

// A website request that became a project, made with this email.
async function websiteRequest(email: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, 'Tier_1') RETURNING id",
    [`T1-${crypto.randomUUID()}`]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, 'Tier_1', $2, $3)",
    [crypto.randomUUID(), rows[0]!.id, JSON.stringify({ email })]
  )

  return rows[0]!.id
}

async function projectRolesOf(personId: string) {
  const { rows } = await database.pool.query<{
    project_id: string
    role: string
  }>("SELECT project_id, role FROM person_project_roles WHERE person_id = $1", [
    personId,
  ])

  return rows
}

describe("signing up", () => {
  it("makes a client account with the email not yet confirmed, and sends the link", async () => {
    const result = await signUp()

    expect(result.token).toBeNull()

    const person = await personByEmail(CLIENT.email)

    expect(person).toMatchObject({
      account_type: "client",
      email_verified: false,
    })
    expect(await count("sessions")).toBe(0)
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]!.subject).toBe("Confirm your email")
    expect(lastToken(CLIENT.email)).not.toBe("")
  })

  it("never makes a staff account, whatever the form sends", async () => {
    // A form sends whatever it likes, whatever the types say.
    const body = {
      name: "Eve",
      email: "eve@example.com",
      password: PASSWORD,
      accountType: "staff",
    }

    await auth.api.signUpEmail({ body }).catch(() => undefined)

    const person = await personByEmail("eve@example.com")

    expect(person?.account_type ?? "client").toBe("client")
  })

  it("answers the same for an email that already has an account, and changes nothing", async () => {
    const staffId = await addPerson()

    const result = await signUp(EMAIL)

    expect(result.token).toBeNull()
    expect(await count("people")).toBe(2)
    expect((await personByEmail(EMAIL))?.id).toBe(staffId)
    expect((await personByEmail(EMAIL))?.account_type).toBe("staff")
  })

  it("refuses to sign in before the email is confirmed, and sends the link again", async () => {
    await signUp()

    expect(await failure(CLIENT.email, PASSWORD)).toMatchObject({
      status: "FORBIDDEN",
    })
    expect(transport.sent).toHaveLength(2)
    expect(await count("sessions")).toBe(0)
  })

  it("confirms the email from the link, then lets the client sign in", async () => {
    await signUp()

    await auth.api.verifyEmail({ query: { token: lastToken(CLIENT.email) } })

    expect((await personByEmail(CLIENT.email))?.email_verified).toBe(true)
    expect(await signIn(CLIENT.email, PASSWORD)).not.toBe("")
  })

  it("logs the sign-up once, and nothing for an email that already has an account", async () => {
    await signUp()
    await signUp()

    const { rows } = await database.pool.query<{ email: string }>(
      "SELECT email FROM access_log WHERE action = 'signed_up'"
    )

    expect(rows).toEqual([{ email: CLIENT.email }])
  })

  it("says so when the link could not be sent again", async () => {
    const failing = createAuth(database, {
      secret: "test-secret-test-secret-test-secret-123",
      baseURL: "http://localhost:3000",
      transport: {
        name: "failing",
        send: async () => {
          throw new Error("Resend is down")
        },
      },
    })

    await signUp()

    await expect(
      failing.api.sendVerificationEmail({ body: { email: CLIENT.email } })
    ).rejects.toThrow()
  })

  it("puts the client on every website request made with their email once it is confirmed", async () => {
    const theirs = await websiteRequest(" Kwaku@TemaFoods.example ")
    await websiteRequest("someone@else.example")

    await signUp()

    const { id } = (await personByEmail(CLIENT.email))!

    expect(await projectRolesOf(id)).toEqual([])

    await auth.api.verifyEmail({ query: { token: lastToken(CLIENT.email) } })

    expect(await projectRolesOf(id)).toEqual([
      { project_id: theirs, role: "Client" },
    ])
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
