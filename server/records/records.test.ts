import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"

import {
  InvalidTransitionError,
  RecordNotEditableError,
  createRecord,
  getRecord,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "./records"

const database = createTestDatabase()

let projectId: string

async function newRecord(state: RecordState = "draft") {
  const record = await createRecord(database, {
    projectId,
    toolId: "D1.1",
    payload: { client: "Acme" },
  })

  // Walk the record forward through the allowed steps to reach `state`.
  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, record.id, step)
  }

  return record
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ('Boiler') RETURNING id"
  )

  projectId = rows[0]!.id
})

afterAll(async () => {
  await database.pool.end()
})

describe("creating a record", () => {
  it("starts in draft and keeps its project, tool, and payload", async () => {
    const record = await createRecord(database, {
      projectId,
      toolId: "D1.1",
      payload: { client: "Acme" },
    })

    expect(record.state).toBe("draft")
    expect(record.projectId).toBe(projectId)
    expect(record.toolId).toBe("D1.1")
    expect(record.payload).toEqual({ client: "Acme" })
  })

  it("can be read back", async () => {
    const record = await newRecord()

    expect(await getRecord(database, record.id)).toEqual(record)
  })
})

describe("transitions", () => {
  it.each([
    ["draft", "submitted"],
    ["submitted", "approved"],
    ["submitted", "draft"],
    ["approved", "locked"],
  ] as const)("allows %s to %s", async (from, to) => {
    const record = await newRecord(from)
    const moved = await transitionRecord(database, record.id, to)

    expect(moved.state).toBe(to)
    expect((await getRecord(database, record.id)).state).toBe(to)
  })

  it.each([
    ["draft", "approved"],
    ["draft", "locked"],
    ["draft", "draft"],
    ["submitted", "locked"],
    ["approved", "draft"],
    ["approved", "submitted"],
    ["locked", "draft"],
    ["locked", "submitted"],
    ["locked", "approved"],
  ] as const)("refuses %s to %s", async (from, to) => {
    const record = await newRecord(from)

    await expect(
      transitionRecord(database, record.id, to)
    ).rejects.toBeInstanceOf(InvalidTransitionError)
    expect((await getRecord(database, record.id)).state).toBe(from)
  })

  it("lets only one of two simultaneous submits through", async () => {
    const record = await newRecord()

    const results = await Promise.allSettled([
      transitionRecord(database, record.id, "submitted"),
      transitionRecord(database, record.id, "submitted"),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect((await getRecord(database, record.id)).state).toBe("submitted")
  })
})

describe("editing a record", () => {
  it("changes the payload while the record is a draft", async () => {
    const record = await newRecord()
    const updated = await updateRecord(database, record.id, { client: "Beta" })

    expect(updated.payload).toEqual({ client: "Beta" })
  })

  it.each(["submitted", "approved", "locked"] as const)(
    "refuses edits when the record is %s",
    async (state) => {
      const record = await newRecord(state)

      await expect(
        updateRecord(database, record.id, { client: "Beta" })
      ).rejects.toBeInstanceOf(RecordNotEditableError)
      expect((await getRecord(database, record.id)).payload).toEqual({
        client: "Acme",
      })
    }
  )
})
