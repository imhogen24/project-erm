import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { JsonObject } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport, type Transport } from "@/server/email/email"
import { systemActor } from "@/server/system/system"

import { pullNewRequests } from "./intake"
import { createIntakeFixtures, link, registerD11 } from "./testing"

const database = createTestDatabase()

const baseURL = "https://erm.example.com"

registerD11()

const { addTier1, addTier3, addItAdmin } = createIntakeFixtures(database)

async function projects() {
  const { rows } = await database.pool.query<{
    id: string
    name: string
    request_id: string
    service_track: string
    status: string
    created_at: Date
  }>("SELECT * FROM projects ORDER BY request_id")

  return rows
}

async function projectFor(requestId: string) {
  const { rows } = await database.pool.query<{
    id: string
    name: string
    service_track: string
    status: string
  }>("SELECT * FROM projects WHERE request_id = $1", [requestId])

  return rows[0]
}

async function recordsOf(projectId: string) {
  const { rows } = await database.pool.query<{
    id: string
    tool_id: string
    state: string
    payload: JsonObject
  }>("SELECT * FROM tool_records WHERE project_id = $1", [projectId])

  return rows
}

async function d11Of(requestId: string) {
  const project = await projectFor(requestId)
  const [record] = await recordsOf(project!.id)

  return record!
}

async function copies() {
  const { rows } = await database.pool.query<{
    request_id: string
    project_id: string | null
    submission: JsonObject
  }>("SELECT * FROM intake_submissions ORDER BY request_id")

  return rows
}

async function websiteRows() {
  const tier1 = await database.pool.query(
    "SELECT * FROM custom_engineering_submissions ORDER BY request_id"
  )

  const tier3 = await database.pool.query(
    "SELECT * FROM drafting_digitization_submissions ORDER BY request_id"
  )

  return [tier1.rows, tier3.rows]
}

async function notificationsOf(personId: string) {
  const { rows } = await database.pool.query<{
    kind: string
    project_id: string
    record_id: string
    path: string
  }>("SELECT * FROM notifications WHERE person_id = $1", [personId])

  return rows
}

async function emailsTo(address: string) {
  const { rows } = await database.pool.query<{
    kind: string
    status: string
    key: string
  }>("SELECT * FROM email_log WHERE recipient = $1", [address])

  return rows
}

function pull(transport: Transport = createFakeTransport()) {
  return pullNewRequests(database, { baseURL, transport })
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await database.pool.end()
})

describe("pullNewRequests", () => {
  it("makes a Tier 1 request an active Tier_1 project with a D1.1 draft", async () => {
    await addTier1({ requestId: "T1-100" })

    await pull()

    const project = await projectFor("T1-100")

    expect(project).toMatchObject({
      name: "Conveyor",
      service_track: "Tier_1",
      status: "active",
    })
    expect(await recordsOf(project!.id)).toMatchObject([
      { tool_id: "D1.1", state: "draft" },
    ])
  })

  it("names a Tier 3 project after the organisation, as drafting", async () => {
    await addTier3({ requestId: "T3-100", organisation: "Aquaresh" })

    await pull()

    expect(await projectFor("T3-100")).toMatchObject({
      name: "Aquaresh - Drafting",
      service_track: "Tier_3",
    })
  })

  it("names a Tier 1 project with no title after the organisation", async () => {
    await addTier1({ requestId: "T1-100", title: " ", organisation: "Acme" })

    await pull()

    expect((await projectFor("T1-100"))!.name).toBe("Acme")
  })

  it("names a project with no title or organisation after the request ID", async () => {
    await addTier1({ requestId: "T1-100", title: "", organisation: "" })
    await addTier3({ requestId: "T3-100", organisation: " " })

    await pull()

    expect((await projectFor("T1-100"))!.name).toBe("Unnamed request T1-100")
    expect((await projectFor("T3-100"))!.name).toBe("Unnamed request T3-100")
  })

  it("sets D1.1's request status to Pending", async () => {
    await addTier1({ requestId: "T1-100" })

    await pull()

    expect((await d11Of("T1-100")).payload.requestStatus).toBe("Pending")
  })

  it("lists each file as a Pending row with its link and the submission date", async () => {
    await addTier1({
      requestId: "T1-100",
      files: [link("one"), link("two"), link("three")],
      createdAt: new Date("2026-10-30T15:20:00Z"),
    })

    await pull()

    const row = (label: string, key: string) => ({
      label,
      dateUploaded: "2026-10-30",
      fileLink: link(key),
      status: "Pending",
    })

    expect((await d11Of("T1-100")).payload.attachedFiles).toEqual([
      row("File 1", "one"),
      row("File 2", "two"),
      row("File 3", "three"),
    ])
  })

  it("reads a Tier 3 request's files from file_attachment", async () => {
    await addTier3({ requestId: "T3-100", files: [link("drawing")] })

    await pull()

    expect((await d11Of("T3-100")).payload.attachedFiles).toMatchObject([
      { label: "File 1", fileLink: link("drawing") },
    ])
  })

  it("leaves the files table empty when the request has no files", async () => {
    await addTier1({ requestId: "T1-100", files: [] })

    const summary = await pull()

    expect(summary.created).toEqual(["T1-100"])
    expect((await d11Of("T1-100")).payload.attachedFiles).toEqual([])
  })

  it("copies none of the client's answers into D1.1, which stay in the saved copy", async () => {
    await addTier1({ requestId: "T1-100" })

    await pull()

    const { payload } = await d11Of("T1-100")
    const [copy] = await copies()

    expect(Object.keys(payload).sort()).toEqual([
      "attachedFiles",
      "requestStatus",
    ])
    expect(JSON.stringify(payload)).not.toContain("ama@client.example.com")
    expect(copy!.submission).toMatchObject({
      email: "ama@client.example.com",
      project_title: "Conveyor",
    })
  })

  it("creates D1.1 as the system person", async () => {
    await addTier1({ requestId: "T1-100" })

    await pull()

    const { id } = await d11Of("T1-100")

    const { rows } = await database.pool.query<{ actor_id: string }>(
      "SELECT DISTINCT actor_id FROM audit_log WHERE record_id = $1 AND action = 'created'",
      [id]
    )

    expect(rows).toEqual([{ actor_id: systemActor }])
  })

  it("tells each IT/Admin once on the dashboard and once by email", async () => {
    const ama = await addItAdmin("Ama")
    const kofi = await addItAdmin("Kofi")
    const transport = createFakeTransport()

    await addTier1({ requestId: "T1-100" })

    await pull(transport)

    const project = await projectFor("T1-100")
    const record = await d11Of("T1-100")

    for (const admin of [ama, kofi]) {
      expect(await notificationsOf(admin.id)).toEqual([
        expect.objectContaining({
          kind: "new_request",
          project_id: project!.id,
          record_id: record.id,
          path: `/admin/team/${project!.id}`,
        }),
      ])
      expect(await emailsTo(admin.email)).toEqual([
        expect.objectContaining({
          kind: "new_request",
          status: "sent",
          key: `new_request:T1-100:${admin.id}`,
        }),
      ])
    }

    expect(transport.sent.map((message) => message.to).sort()).toEqual(
      [ama.email, kofi.email].sort()
    )
    expect(transport.sent[0]!.text).toContain(
      `${baseURL}/admin/team/${project!.id}`
    )
  })

  it("keeps the project, D1.1 and the notification when the email fails", async () => {
    const ama = await addItAdmin("Ama")

    const broken: Transport = {
      name: "broken",
      send: async () => {
        throw new Error("The mail server is down")
      },
    }

    await addTier1({ requestId: "T1-100" })

    const summary = await pull(broken)

    expect(summary.created).toEqual(["T1-100"])
    expect(await d11Of("T1-100")).toBeDefined()
    expect(await notificationsOf(ama.id)).toHaveLength(1)
    expect(await emailsTo(ama.email)).toEqual([
      expect.objectContaining({ status: "failed" }),
    ])
  })

  it("changes nothing when it runs a second time", async () => {
    const ama = await addItAdmin("Ama")
    const transport = createFakeTransport()

    await addTier1({ requestId: "T1-100" })

    await pull(transport)
    const second = await pull(transport)

    const [project] = await projects()

    expect(second).toEqual({ created: [], skipped: [], failed: [] })
    expect(await projects()).toHaveLength(1)
    expect(await recordsOf(project!.id)).toHaveLength(1)
    expect(await copies()).toHaveLength(1)
    expect(await notificationsOf(ama.id)).toHaveLength(1)
    expect(transport.sent).toHaveLength(1)
  })

  it("reports a request it cannot pull in, saves none of it, and goes on with the next", async () => {
    // A blank request ID cannot become a project.
    await addTier1({
      requestId: " ",
      createdAt: new Date("2026-11-01T08:00:00Z"),
    })
    await addTier1({
      requestId: "T1-200",
      createdAt: new Date("2026-11-01T09:00:00Z"),
    })

    const summary = await pull()

    expect(summary).toEqual({
      created: ["T1-200"],
      skipped: [],
      failed: [" "],
    })
    expect((await projects()).map((project) => project.request_id)).toEqual([
      "T1-200",
    ])
    expect((await copies()).map((copy) => copy.request_id)).toEqual(["T1-200"])
  })

  it("links the copy to a project that already has the request ID and creates nothing else", async () => {
    const ama = await addItAdmin("Ama")

    const { rows } = await database.pool.query<{ id: string }>(
      "INSERT INTO projects (name, request_id, service_track) VALUES ('By hand', 'T1-100', 'Tier_1') RETURNING id"
    )

    const existing = rows[0]!.id

    await addTier1({ requestId: "T1-100" })

    const summary = await pull()

    expect(summary).toEqual({ created: [], skipped: ["T1-100"], failed: [] })
    expect(await projects()).toHaveLength(1)
    expect(await recordsOf(existing)).toEqual([])
    expect(await copies()).toMatchObject([
      { request_id: "T1-100", project_id: existing },
    ])
    expect(await notificationsOf(ama.id)).toEqual([])
  })

  it("creates the projects oldest first", async () => {
    await addTier1({
      requestId: "T1-late",
      createdAt: new Date("2026-11-03T00:00:00Z"),
    })
    await addTier3({
      requestId: "T3-early",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    })
    await addTier1({
      requestId: "T1-middle",
      createdAt: new Date("2026-11-02T00:00:00Z"),
    })

    const summary = await pull()

    const created = (await projects())
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map((project) => project.request_id)

    expect(summary.created).toEqual(["T3-early", "T1-middle", "T1-late"])
    expect(created).toEqual(["T3-early", "T1-middle", "T1-late"])
  })

  it("returns only request IDs, with none of the client's details", async () => {
    await addTier1({ requestId: "T1-100", title: "Secret conveyor" })
    await addTier3({ requestId: "T3-100", organisation: "Aquaresh" })

    const summary = await pull()

    expect(summary).toEqual({
      created: ["T1-100", "T3-100"],
      skipped: [],
      failed: [],
    })
  })

  it("leaves the website's rows as they were", async () => {
    await addTier1({ requestId: "T1-100" })
    await addTier3({ requestId: "T3-100" })

    const before = await websiteRows()

    await pull()

    expect(await websiteRows()).toEqual(before)
  })

  it("works with no network, since no file link is fetched", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"))

    await addTier1({ requestId: "T1-100", files: [link("one"), link("two")] })

    const summary = await pull()

    expect(summary.created).toEqual(["T1-100"])
    expect(fetch).not.toHaveBeenCalled()
  })
})
