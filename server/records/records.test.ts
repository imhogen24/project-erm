import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"

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

let actor: string

// A person holding `held` on the test project.
async function addActor(held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function newRecord(state: RecordState = "draft") {
  const record = await createRecord(database, actor, {
    projectId,
    toolId: "D1.3",
    payload: { client: "Acme" },
  })

  // Walk the record forward through the allowed steps to reach `state`.
  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ('Boiler') RETURNING id"
  )

  projectId = rows[0]!.id

  // On D1.3, OM can write and PM can approve, so together they can do it all.
  actor = await addActor(["OM", "PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("creating a record", () => {
  it("starts in draft and keeps its project, tool, and payload", async () => {
    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D1.3",
      payload: { client: "Acme" },
    })

    expect(record.state).toBe("draft")
    expect(record.projectId).toBe(projectId)
    expect(record.toolId).toBe("D1.3")
    expect(record.payload).toEqual({ client: "Acme" })
  })

  it("can be read back", async () => {
    const record = await newRecord()

    expect(await getRecord(database, actor, record.id)).toEqual(record)
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
    const moved = await transitionRecord(database, actor, record.id, to)

    expect(moved.state).toBe(to)
    expect((await getRecord(database, actor, record.id)).state).toBe(to)
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
      transitionRecord(database, actor, record.id, to)
    ).rejects.toBeInstanceOf(InvalidTransitionError)
    expect((await getRecord(database, actor, record.id)).state).toBe(from)
  })

  it("lets only one of two simultaneous submits through", async () => {
    const record = await newRecord()

    const results = await Promise.allSettled([
      transitionRecord(database, actor, record.id, "submitted"),
      transitionRecord(database, actor, record.id, "submitted"),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect((await getRecord(database, actor, record.id)).state).toBe(
      "submitted"
    )
  })
})

describe("editing a record", () => {
  it("changes the payload while the record is a draft", async () => {
    const record = await newRecord()

    const updated = await updateRecord(database, actor, record.id, {
      client: "Beta",
    })

    expect(updated.payload).toEqual({ client: "Beta" })
  })

  it.each(["submitted", "approved", "locked"] as const)(
    "refuses edits when the record is %s",
    async (state) => {
      const record = await newRecord(state)

      await expect(
        updateRecord(database, actor, record.id, { client: "Beta" })
      ).rejects.toBeInstanceOf(RecordNotEditableError)
      expect((await getRecord(database, actor, record.id)).payload).toEqual({
        client: "Acme",
      })
    }
  )
})

describe("deleting a project", () => {
  it("is refused while the project still has records", async () => {
    const record = await newRecord("locked")

    await expect(
      database.pool.query("DELETE FROM projects WHERE id = $1", [projectId])
    ).rejects.toThrow()
    expect((await getRecord(database, actor, record.id)).state).toBe("locked")
  })
})

describe("permissions", () => {
  it("refuses an update from a role that can only read", async () => {
    const record = await newRecord()
    const reader = await addActor(["Client"])

    await expect(
      updateRecord(database, reader, record.id, { client: "Beta" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect((await getRecord(database, actor, record.id)).payload).toEqual({
      client: "Acme",
    })
  })

  it("refuses an approval from a role that can only write", async () => {
    const record = await newRecord("submitted")
    const writer = await addActor(["OM"])

    await expect(
      transitionRecord(database, writer, record.id, "approved")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect((await getRecord(database, actor, record.id)).state).toBe(
      "submitted"
    )
  })

  it("refuses a read from a role with no access", async () => {
    const record = await newRecord()
    const outsider = await addActor(["LE"])

    await expect(
      getRecord(database, outsider, record.id)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses to create a record without write access", async () => {
    const reader = await addActor(["Client"])

    await expect(
      createRecord(database, reader, { projectId, toolId: "D1.3" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses submit and send-back without write access", async () => {
    const record = await newRecord()
    const approver = await addActor(["PM"])

    await expect(
      transitionRecord(database, approver, record.id, "submitted")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses locking without approve access", async () => {
    const record = await newRecord("approved")
    const writer = await addActor(["OM"])

    await expect(
      transitionRecord(database, writer, record.id, "locked")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
