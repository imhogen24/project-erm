import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const url = "http://localhost:3000/api/inngest"

// A key in Inngest's shape. It signs nothing here.
const signingKey = `signkey-test-${"a".repeat(64)}`

// The client reads its settings on first use, so each test gets a fresh one
// built from the keys it set.
async function handlers() {
  vi.resetModules()

  const { inngestHandlers } = await import("./serve")

  return inngestHandlers()
}

function setKeys(keys: { signingKey?: string; dev?: string }) {
  vi.stubEnv("INNGEST_SIGNING_KEY", keys.signingKey)
  vi.stubEnv("INNGEST_EVENT_KEY", keys.signingKey && "event-key")
  vi.stubEnv("INNGEST_DEV", keys.dev)
}

function unsignedRun() {
  return new NextRequest(`${url}?fnId=project-erm-intake-run&stepId=step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: {}, events: [], steps: {}, ctx: {} }),
  })
}

beforeEach(() => {
  vi.stubEnv("INNGEST_SIGNING_KEY_FALLBACK", undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("/api/inngest", () => {
  it("refuses a request with no valid signature", async () => {
    setKeys({ signingKey })

    const { POST } = await handlers()
    const response = await POST(unsignedRun(), undefined)

    expect(response.status).toBe(401)
  })

  it("refuses a request with a wrong signature", async () => {
    setKeys({ signingKey })

    const request = unsignedRun()

    request.headers.set("X-Inngest-Signature", "t=1&s=not-a-signature")

    const { POST } = await handlers()
    const response = await POST(request, undefined)

    expect(response.status).toBe(401)
  })

  it("answers 'not configured', without an error, when the keys are not set", async () => {
    setKeys({})

    const { GET, POST, PUT } = await handlers()

    for (const handler of [GET, POST, PUT]) {
      const response = await handler(new NextRequest(url), undefined)

      expect(response.status).toBe(200)
      expect(await response.text()).toMatch(/not configured/i)
    }
  })

  it("serves the functions when the keys are set", async () => {
    setKeys({ signingKey })

    const { GET } = await handlers()
    const response = await GET(new NextRequest(url), undefined)

    expect(await response.text()).not.toMatch(/not configured/i)
  })

  it("serves the functions to the local dev server with no keys", async () => {
    setKeys({ dev: "1" })

    const { GET } = await handlers()
    const response = await GET(new NextRequest(url), undefined)

    expect(response.status).toBe(200)
    expect(await response.text()).not.toMatch(/not configured/i)
  })
})
