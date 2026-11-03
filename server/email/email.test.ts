import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"

import {
  createFakeTransport,
  getTransport,
  sendEmail,
  type Transport,
} from "./email"
import { emailKinds, renderEmail, type EmailDataByKind } from "./templates"

const database = createTestDatabase()

beforeEach(async () => {
  await resetTestData(database)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await database.pool.end()
})

const sampleData: EmailDataByKind = {
  new_request: { requestId: "T1-100", link: "https://erm.example.com/a" },
  assigned: { projectName: "Conveyor", link: "https://erm.example.com/b" },
  approval_needed: {
    recordTitle: "D1.1 review",
    link: "https://erm.example.com/c",
  },
}

function failingTransport(): Transport {
  return {
    name: "failing",
    send: async () => {
      throw new Error("Resend is down")
    },
  }
}

async function rows() {
  const { rows } = await database.pool.query<{
    id: string
    recipient: string
    kind: string
    message_id: string | null
    status: string
    error: string | null
    key: string
  }>("SELECT * FROM email_log")

  return rows
}

describe("sendEmail", () => {
  it("logs a sent row and the fake records the address, subject and sender", async () => {
    const transport = createFakeTransport()

    const row = await sendEmail(
      database,
      {
        to: "it@example.com",
        kind: "new_request",
        data: sampleData.new_request,
        key: "new_request:T1-100",
      },
      transport
    )

    const logged = await rows()

    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({
      recipient: "it@example.com",
      kind: "new_request",
      status: "sent",
      key: "new_request:T1-100",
    })
    expect(logged[0].message_id).toBeTruthy()
    expect(row.id).toBe(logged[0].id)

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: "it@example.com",
      from: process.env.EMAIL_FROM,
    })
    expect(transport.sent[0].subject).toBeTruthy()
  })

  it("sends from the noreply address", async () => {
    const transport = createFakeTransport()

    await sendEmail(
      database,
      {
        to: "it@example.com",
        kind: "assigned",
        data: sampleData.assigned,
        key: "assigned:1",
      },
      transport
    )

    expect(transport.sent[0].from).toBe("noreply@admin.imhogen.com")
  })

  it("sends once and keeps one row when the same key is used twice", async () => {
    const transport = createFakeTransport()

    const input = {
      to: "it@example.com",
      kind: "new_request" as const,
      data: sampleData.new_request,
      key: "new_request:T1-200",
    }

    const first = await sendEmail(database, input, transport)
    const second = await sendEmail(database, input, transport)

    expect(transport.sent).toHaveLength(1)
    expect(await rows()).toHaveLength(1)
    expect(second.id).toBe(first.id)
  })

  it("marks the row failed with the error and does not throw", async () => {
    const row = await sendEmail(
      database,
      {
        to: "it@example.com",
        kind: "approval_needed",
        data: sampleData.approval_needed,
        key: "approval_needed:1",
      },
      failingTransport()
    )

    expect(row.status).toBe("failed")

    const logged = await rows()

    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({
      status: "failed",
      error: "Resend is down",
      message_id: null,
    })
  })

  it("sends on a retry after a failure and the row becomes sent", async () => {
    const input = {
      to: "it@example.com",
      kind: "approval_needed" as const,
      data: sampleData.approval_needed,
      key: "approval_needed:2",
    }

    await sendEmail(database, input, failingTransport())

    const transport = createFakeTransport()
    const row = await sendEmail(database, input, transport)

    expect(transport.sent).toHaveLength(1)
    expect(row.status).toBe("sent")

    const logged = await rows()

    expect(logged).toHaveLength(1)
    expect(logged[0].status).toBe("sent")
    expect(logged[0].message_id).toBeTruthy()
    expect(logged[0].error).toBeNull()
  })

  it("sends each kind with a subject, a text body and an HTML body", async () => {
    const transport = createFakeTransport()

    for (const kind of emailKinds) {
      await sendEmail(
        database,
        {
          to: "it@example.com",
          kind,
          data: sampleData[kind],
          key: `${kind}:each`,
        },
        transport
      )
    }

    expect(transport.sent).toHaveLength(emailKinds.length)

    for (const message of transport.sent) {
      expect(message.subject).toBeTruthy()
      expect(message.text).toBeTruthy()
      expect(message.html).toBeTruthy()
    }
  })

  it("passes the key to the provider as its idempotency key", async () => {
    const send = vi.fn<Transport["send"]>(async () => ({ id: "message-1" }))

    await sendEmail(
      database,
      {
        to: "it@example.com",
        kind: "assigned",
        data: sampleData.assigned,
        key: "assigned:idempotent",
      },
      { name: "spy", send }
    )

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "it@example.com" }),
      { idempotencyKey: "assigned:idempotent" }
    )
  })

  it("refuses an address that is not an email and sends nothing", async () => {
    const transport = createFakeTransport()

    await expect(
      sendEmail(
        database,
        {
          to: "not-an-email",
          kind: "new_request",
          data: sampleData.new_request,
          key: "new_request:bad",
        },
        transport
      )
    ).rejects.toThrow()

    expect(transport.sent).toHaveLength(0)
    expect(await rows()).toHaveLength(0)
  })
})

describe("templates", () => {
  it("covers the three staff kinds", () => {
    expect([...emailKinds].sort()).toEqual([
      "approval_needed",
      "assigned",
      "new_request",
    ])
  })

  it("marks every wording as placeholder", () => {
    for (const kind of emailKinds) {
      const email = renderEmail(kind, sampleData[kind])

      expect(email.subject).toContain("PLACEHOLDER")
      expect(email.text).toContain("PLACEHOLDER")
      expect(email.html).toContain("PLACEHOLDER")
    }
  })
})

describe("getTransport", () => {
  it("uses the fake when the Resend key is not set, and nothing leaves the machine", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("VERCEL_ENV", "")

    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    expect(getTransport().name).toBe("fake")

    const row = await sendEmail(database, {
      to: "it@example.com",
      kind: "new_request",
      data: sampleData.new_request,
      key: "new_request:no-key",
    })

    expect(row.status).toBe("sent")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("fails every send in production when the Resend key is not set", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("VERCEL_ENV", "production")

    expect(getTransport().name).toBe("missing-key")

    const row = await sendEmail(database, {
      to: "it@example.com",
      kind: "new_request",
      data: sampleData.new_request,
      key: "new_request:production-no-key",
    })

    expect(row).toMatchObject({
      status: "failed",
      error: "RESEND_API_KEY is not set",
    })
  })

  it("uses Resend when the key is set", () => {
    vi.stubEnv("RESEND_API_KEY", "test-key")

    expect(getTransport().name).toBe("resend")
  })
})

describe("secrets", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) {
        return sourceFiles(path)
      }

      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [path]
        : []
    })
  }

  it("writes no key and no address in the code", () => {
    const files = sourceFiles(join(process.cwd(), "server/email"))

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = readFileSync(file, "utf8")

      expect(source, file).not.toMatch(/re_[A-Za-z0-9_]{10,}/)
      expect(source, file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
    }
  })
})
