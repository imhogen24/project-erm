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

type LogLine = {
  actor_id: string
  action: string
  person_id: string | null
  email: string
  project_id: string | null
  roles: string[] | null
}

async function addPerson(email = EMAIL) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [email]
  )

  const personId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO accounts (person_id, account_id, provider_id, password) VALUES ($1, $2, 'credential', $3)",
    [personId, personId, await hashPassword(PASSWORD)]
  )

  return personId
}

async function signIn(email = EMAIL, password = PASSWORD) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })

  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")

  return new Headers({ cookie })
}

async function signInFails(email: string, password: string) {
  try {
    await auth.api.signInEmail({ body: { email, password } })
  } catch {
    return true
  }

  return false
}

async function logLines() {
  const { rows } = await database.pool.query<LogLine>(
    "SELECT actor_id, action, person_id, email, project_id, roles FROM access_log ORDER BY created_at, id"
  )

  return rows
}

async function sessionCount() {
  const { rows } = await database.pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM sessions"
  )

  return Number(rows[0]!.n)
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("logging a sign-in", () => {
  it("writes one signed_in line for the person, with no project or roles", async () => {
    const personId = await addPerson()

    await signIn()

    expect(await logLines()).toEqual([
      {
        actor_id: personId,
        action: "signed_in",
        person_id: personId,
        email: EMAIL,
        project_id: null,
        roles: null,
      },
    ])
  })

  it("logs the email on the account, in lower case", async () => {
    await addPerson()

    await signIn("AMA@Example.com")

    expect((await logLines()).map((line) => line.email)).toEqual([EMAIL])
  })

  it("writes one line per session when the person signs in twice", async () => {
    const personId = await addPerson()

    await signIn()
    await signIn()

    const lines = await logLines()

    expect(lines.map((line) => line.action)).toEqual(["signed_in", "signed_in"])
    expect(lines.map((line) => line.person_id)).toEqual([personId, personId])
    expect(await sessionCount()).toBe(2)
  })

  it("writes nothing for a wrong password, and makes no session", async () => {
    await addPerson()

    expect(await signInFails(EMAIL, "wrong-password")).toBe(true)

    expect(await logLines()).toEqual([])
    expect(await sessionCount()).toBe(0)
  })

  it("writes nothing for an email with no account", async () => {
    expect(await signInFails("nobody@example.com", PASSWORD)).toBe(true)

    expect(await logLines()).toEqual([])
  })

  it("refuses the sign-in and makes no session when the log line cannot be written", async () => {
    await addPerson()

    await database.pool.query(`
      CREATE FUNCTION refuse_sign_in_line() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'the log is broken';
      END;
      $$ LANGUAGE plpgsql
    `)
    await database.pool.query(`
      CREATE TRIGGER refuse_sign_in_line BEFORE INSERT ON access_log
      FOR EACH ROW EXECUTE FUNCTION refuse_sign_in_line()
    `)

    try {
      expect(await signInFails(EMAIL, PASSWORD)).toBe(true)
      expect(await sessionCount()).toBe(0)
    } finally {
      await database.pool.query(
        "DROP TRIGGER refuse_sign_in_line ON access_log"
      )
      await database.pool.query("DROP FUNCTION refuse_sign_in_line()")
    }

    expect(await logLines()).toEqual([])
  })
})

describe("logging a sign-out", () => {
  it("writes one signed_out line for the same person", async () => {
    const personId = await addPerson()

    const headers = await signIn()

    await auth.api.signOut({ headers })

    expect(await logLines()).toEqual([
      expect.objectContaining({ action: "signed_in" }),
      {
        actor_id: personId,
        action: "signed_out",
        person_id: personId,
        email: EMAIL,
        project_id: null,
        roles: null,
      },
    ])
  })

  it("writes one line and keeps the other session working when one of two signs out", async () => {
    await addPerson()

    const laptop = await signIn()
    const phone = await signIn()

    await auth.api.signOut({ headers: laptop })

    const lines = await logLines()

    expect(lines.filter((line) => line.action === "signed_out")).toHaveLength(1)
    expect(await auth.api.getSession({ headers: phone })).not.toBeNull()
    expect(await auth.api.getSession({ headers: laptop })).toBeNull()
  })

  it("writes a line for each session a person revokes on purpose", async () => {
    await addPerson()

    const laptop = await signIn()
    const phone = await signIn()
    const tablet = await signIn()

    await auth.api.revokeOtherSessions({ headers: laptop })

    const signedOut = (await logLines()).filter(
      (line) => line.action === "signed_out"
    )

    expect(signedOut).toHaveLength(2)
    expect(await auth.api.getSession({ headers: laptop })).not.toBeNull()
    expect(await auth.api.getSession({ headers: phone })).toBeNull()
    expect(await auth.api.getSession({ headers: tablet })).toBeNull()
  })

  it("writes a line for every session when a person revokes them all", async () => {
    await addPerson()

    const laptop = await signIn()

    await signIn()
    await auth.api.revokeSessions({ headers: laptop })

    expect(
      (await logLines()).filter((line) => line.action === "signed_out")
    ).toHaveLength(2)
    expect(await sessionCount()).toBe(0)
  })

  it("writes nothing when a session has run out", async () => {
    await addPerson()

    const headers = await signIn()

    await database.pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 minute'"
    )

    expect(await auth.api.getSession({ headers })).toBeNull()
    expect(await sessionCount()).toBe(0)
    expect((await logLines()).map((line) => line.action)).toEqual(["signed_in"])
  })

  it("writes nothing when someone with no session signs out", async () => {
    await addPerson()

    await auth.api.signOut({ headers: new Headers() })

    expect(await logLines()).toEqual([])
  })

  it("writes nothing the second time the same session signs out", async () => {
    await addPerson()

    const headers = await signIn()

    await auth.api.signOut({ headers })
    await auth.api.signOut({ headers })

    expect(
      (await logLines()).filter((line) => line.action === "signed_out")
    ).toHaveLength(1)
  })
})
