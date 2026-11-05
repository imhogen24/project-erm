import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport } from "@/server/email/email"

import { pullNewRequests } from "./intake"
import { getRequestDetails } from "./request-details"
import { createIntakeFixtures, link, registerD11 } from "./testing"

const database = createTestDatabase()

registerD11()

const { addTier1, addTier3, addPerson } = createIntakeFixtures(database)

async function pull() {
  await pullNewRequests(database, {
    baseURL: "https://erm.example.com",
    transport: createFakeTransport(),
  })
}

async function projectOf(requestId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE request_id = $1",
    [requestId]
  )

  return rows[0]!.id
}

async function addToProject(projectId: string, role: string) {
  const person = await addPerson(role)

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [person.id, projectId, role]
  )

  return person.id
}

const NOT_APPLICABLE = "Not applicable (web form)"

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("the metadata", () => {
  it("reads the source, the time received and the sender from the saved copy", async () => {
    await addTier1({
      requestId: "T1-1",
      createdAt: new Date("2026-11-03T09:14:00Z"),
    })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.metadata?.source).toBe("Web Form")
    expect(details?.metadata?.receivedAt).toEqual(
      new Date("2026-11-03T09:14:00Z")
    )
    expect(details?.metadata?.sender).toBe("ama@client.example.com")
  })

  it("says not applicable for the recipient and the subject", async () => {
    await addTier1({ requestId: "T1-1" })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.metadata?.recipient).toBe(NOT_APPLICABLE)
    expect(details?.metadata?.subject).toBe(NOT_APPLICABLE)
  })

  it("reads a Tier 3 request the same way", async () => {
    await addTier3({
      requestId: "T3-1",
      createdAt: new Date("2026-11-04T10:30:00Z"),
    })
    await pull()

    const projectId = await projectOf("T3-1")
    const pm = await addToProject(projectId, "PM")

    const details = await getRequestDetails(database, pm, projectId)

    expect(details?.metadata?.sender).toBe("kofi@client.example.com")
    expect(details?.metadata?.receivedAt).toEqual(
      new Date("2026-11-04T10:30:00Z")
    )
  })

  it("works before any D1.2 record exists", async () => {
    await addTier1({ requestId: "T1-1", files: [link("a")] })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const { rows } = await database.pool.query(
      "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = 'D1.2'",
      [projectId]
    )

    expect(rows).toHaveLength(0)

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.metadata?.sender).toBe("ama@client.example.com")
    expect(details?.files).toHaveLength(1)
  })

  it("leaves the metadata empty when the project has no saved request", async () => {
    const { rows } = await database.pool.query<{ id: string }>(
      "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-none', 'Tier_1') RETURNING id"
    )

    const projectId = rows[0]!.id
    const om = await addToProject(projectId, "OM")

    const details = await getRequestDetails(database, om, projectId)

    expect(details).toEqual({
      metadata: null,
      files: [],
      filesRecordId: null,
    })
  })
})

describe("the files", () => {
  it("comes back in D1.1's order with the type, link and status", async () => {
    await addTier1({
      requestId: "T1-1",
      files: [link("one"), link("two"), link("three")],
    })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.files.map((file) => file.fileLink)).toEqual([
      link("one"),
      link("two"),
      link("three"),
    ])
    expect(details?.files.every((file) => file.label !== "")).toBe(true)
    expect(details?.files.map((file) => file.status)).toEqual([
      "Pending",
      "Pending",
      "Pending",
    ])
  })

  it("shows the new status after D1.1 changes", async () => {
    await addTier1({ requestId: "T1-1", files: [link("one"), link("two")] })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    await database.pool.query(
      `UPDATE tool_records
       SET payload = jsonb_set(payload, '{attachedFiles,1,status}', '"Reviewed"')
       WHERE project_id = $1 AND tool_id = 'D1.1'`,
      [projectId]
    )

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.files.map((file) => file.status)).toEqual([
      "Pending",
      "Reviewed",
    ])
  })

  it("names the D1.1 record the files are opened through", async () => {
    await addTier1({ requestId: "T1-1", files: [link("one")] })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const { rows } = await database.pool.query<{ id: string }>(
      "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = 'D1.1'",
      [projectId]
    )

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.filesRecordId).toBe(rows[0]!.id)
  })

  it("is an empty list, not an error, when D1.1 has no files", async () => {
    await addTier1({ requestId: "T1-1", files: [] })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")

    const details = await getRequestDetails(database, om, projectId)

    expect(details?.files).toEqual([])
    expect(details?.metadata?.sender).toBe("ama@client.example.com")
  })
})

describe("who may read it", () => {
  it("gives the PM and the OM the same details", async () => {
    await addTier1({ requestId: "T1-1" })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")
    const pm = await addToProject(projectId, "PM")

    expect(await getRequestDetails(database, pm, projectId)).toEqual(
      await getRequestDetails(database, om, projectId)
    )
  })

  it("gives a client nothing", async () => {
    await addTier1({ requestId: "T1-1" })
    await pull()

    const projectId = await projectOf("T1-1")
    const client = await addToProject(projectId, "Client")

    expect(await getRequestDetails(database, client, projectId)).toBeNull()
  })

  it("gives a person outside the project nothing", async () => {
    await addTier1({ requestId: "T1-1" })
    await pull()
    await addTier1({ requestId: "T1-2" })
    await pull()

    const first = await projectOf("T1-1")
    const second = await projectOf("T1-2")
    const elsewhere = await addToProject(second, "OM")

    expect(await getRequestDetails(database, elsewhere, first)).toBeNull()
  })
})
