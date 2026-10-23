import { hashPassword } from "better-auth/crypto"
import { NextRequest } from "next/server"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"

import { createAuth } from "./auth"
import { createProxy } from "./protect"

const database = createTestDatabase()

const auth = createAuth(database, {
  secret: "test-secret-test-secret-test-secret-123",
  baseURL: "http://localhost:3000",
})

const proxy = createProxy(auth)

const EMAIL = "ama@example.com"

const PASSWORD = "correct-horse-battery"

async function signedInCookie() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [EMAIL]
  )

  await database.pool.query(
    "INSERT INTO accounts (person_id, account_id, provider_id, password) VALUES ($1, $2, 'credential', $3)",
    [rows[0]!.id, rows[0]!.id, await hashPassword(PASSWORD)]
  )

  const { headers } = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    returnHeaders: true,
  })

  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  })
}

function redirectsToSignIn(response: Response) {
  const location = response.headers.get("location")

  return (
    response.status >= 300 &&
    response.status < 400 &&
    new URL(location ?? "", "http://localhost:3000").pathname === "/sign-in"
  )
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("route protection", () => {
  it("sends a signed-out visitor from a protected route to /sign-in", async () => {
    expect(redirectsToSignIn(await proxy(request("/projects")))).toBe(true)
  })

  it("protects the home page too", async () => {
    expect(redirectsToSignIn(await proxy(request("/")))).toBe(true)
  })

  it("protects a route that nobody listed anywhere", async () => {
    expect(redirectsToSignIn(await proxy(request("/some/new/route")))).toBe(
      true
    )
  })

  it("lets a signed-in person through", async () => {
    const cookie = await signedInCookie()

    const response = await proxy(request("/projects", cookie))

    expect(redirectsToSignIn(response)).toBe(false)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("sends a person back to /sign-in after signing out", async () => {
    const cookie = await signedInCookie()

    await auth.api.signOut({ headers: new Headers({ cookie }) })

    expect(redirectsToSignIn(await proxy(request("/projects", cookie)))).toBe(
      true
    )
  })

  it("sends a visitor with a made-up session cookie to /sign-in", async () => {
    const response = await proxy(
      request("/projects", "better-auth.session_token=not-a-real-session")
    )

    expect(redirectsToSignIn(response)).toBe(true)
  })

  it("leaves /sign-in open, so there is no redirect loop", async () => {
    const response = await proxy(request("/sign-in"))

    expect(redirectsToSignIn(response)).toBe(false)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("leaves Better-Auth's own routes open", async () => {
    const response = await proxy(request("/api/auth/sign-in/email"))

    expect(redirectsToSignIn(response)).toBe(false)
  })

  it("does not open a path that only starts like /sign-in", async () => {
    expect(redirectsToSignIn(await proxy(request("/sign-in-admin")))).toBe(true)
  })

  it("leaves invite links open, since the person has no account yet", async () => {
    const response = await proxy(request("/invite/some-token"))

    expect(redirectsToSignIn(response)).toBe(false)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("does not open a path that only starts like /invite", async () => {
    expect(redirectsToSignIn(await proxy(request("/invite-admin")))).toBe(true)
    expect(redirectsToSignIn(await proxy(request("/invites")))).toBe(true)
  })

  it("keeps the invite admin page behind a sign-in", async () => {
    expect(redirectsToSignIn(await proxy(request("/admin/invites")))).toBe(true)
  })
})
