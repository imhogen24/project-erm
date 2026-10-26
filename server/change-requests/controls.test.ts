import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  createRecord,
  transitionRecord,
  type RecordState,
} from "@/server/records/records"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { decideChange, requestChange } from "./change-requests"
import { changeControlsFor } from "./controls"

const database = createTestDatabase()

let projectId: string

// Holds every role, so permissions never get in the way of building records.
let actor: string

// On D1.8, LE writes, PM approves and OM only reads.
let writer: string

let pm: string

let reader: string

registerTestTools({ wb01: ["D1.8", "D1.16"] })

loadUnorderedWorkflow({ wb01: ["D1.8", "D1.16"] })

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, 'Tier_1') RETURNING id",
    [`T1-${crypto.randomUUID()}`]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: readonly Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function recordIn(state: RecordState, toolId = "D1.8") {
  const record = await createRecord(database, actor, {
    projectId,
    toolId,
    payload: { note: "Survey on 3 March" },
  })

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  actor = await addPerson("Everyone", [
    "PM",
    "OM",
    "LE",
    "AE",
    "FO",
    "HE",
    "IT/Admin",
  ])
  writer = await addPerson("Lea", ["LE"])
  pm = await addPerson("Pat", ["PM"])
  reader = await addPerson("Olu", ["OM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("what a person can do with a record", () => {
  it("lets the writer ask for a change on a locked record", async () => {
    const record = await recordIn("locked")

    const { records } = await changeControlsFor(database, writer, projectId)

    expect(records).toEqual([
      {
        toolId: "D1.8",
        recordId: record.id,
        state: "locked",
        canRequest: true,
      },
    ])
  })

  it("does not offer a change to a role that can only read", async () => {
    await recordIn("locked")

    const { records } = await changeControlsFor(database, reader, projectId)

    expect(records.map((record) => record.canRequest)).toEqual([false])
  })

  it.each(["draft", "submitted", "approved"] as const)(
    "does not offer a change on a %s record",
    async (state) => {
      await recordIn(state)

      const { records } = await changeControlsFor(database, writer, projectId)

      expect(records.map((record) => record.canRequest)).toEqual([false])
    }
  )

  it("shows the open request on the record, and stops offering another", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, "Wrong")

    const { records } = await changeControlsFor(database, writer, projectId)

    expect(records[0]).toMatchObject({
      canRequest: false,
      request: { id: request.id, status: "requested" },
    })
  })

  it("shows an approved request on the record it reopened", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, "Wrong")

    await decideChange(database, pm, request.id, { outcome: "approved" })

    const { records } = await changeControlsFor(database, writer, projectId)

    expect(records[0]).toMatchObject({
      state: "draft",
      request: { id: request.id, status: "approved" },
    })
  })

  it("forgets a request that was rejected, and offers a change again", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, "Wrong")

    await decideChange(database, pm, request.id, {
      outcome: "rejected",
      reason: "It is right",
    })

    const { records } = await changeControlsFor(database, writer, projectId)

    expect(records[0]).toMatchObject({ canRequest: true })
    expect(records[0]!.request).toBeUndefined()
  })

  it("lists only the newest record of a tool", async () => {
    await recordIn("locked")
    await recordIn("draft", "D1.16")

    const { records } = await changeControlsFor(database, writer, projectId)

    expect(records.map((record) => record.toolId).sort()).toEqual([
      "D1.16",
      "D1.8",
    ])
  })
})

describe("the requests waiting for the PM", () => {
  it("lists them for the project's PM, with the tool, the reason and who asked", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, "Wrong")

    const controls = await changeControlsFor(database, pm, projectId)

    expect(controls.isPm).toBe(true)
    expect(controls.waiting).toHaveLength(1)
    expect(controls.waiting[0]).toMatchObject({
      id: request.id,
      recordId: record.id,
      toolId: "D1.8",
      toolName: "Test D1.8",
      reason: "Wrong",
      requestedBy: "Lea",
    })
  })

  it("lists none for anyone who is not the PM", async () => {
    const record = await recordIn("locked")

    await requestChange(database, writer, record.id, "Wrong")

    const controls = await changeControlsFor(database, writer, projectId)

    expect(controls.isPm).toBe(false)
    expect(controls.waiting).toEqual([])
  })

  it("leaves out requests that are decided", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, "Wrong")

    await decideChange(database, pm, request.id, { outcome: "approved" })

    expect((await changeControlsFor(database, pm, projectId)).waiting).toEqual(
      []
    )
  })

  it("puts the oldest request first", async () => {
    const first = await recordIn("locked")
    const second = await recordIn("locked", "D1.16")

    await requestChange(database, writer, first.id, "First")
    await requestChange(database, actor, second.id, "Second")

    const { waiting } = await changeControlsFor(database, pm, projectId)

    expect(waiting.map((request) => request.reason)).toEqual([
      "First",
      "Second",
    ])
  })
})

describe("who may ask", () => {
  it("refuses a person who is not on the project", async () => {
    const stranger = (
      await database.pool.query<{ id: string }>(
        "INSERT INTO people (name, email) VALUES ('Zed', 'zed@example.com') RETURNING id"
      )
    ).rows[0]!.id

    await expect(
      changeControlsFor(database, stranger, projectId)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
