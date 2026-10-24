import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ProjectStatus, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { setProjectStatus } from "@/server/projects/projects"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotEditableError,
  createRecord,
  getRecord,
  transitionRecord,
  updateRecord,
  type JsonObject,
  type RecordState,
  type ToolRecord,
} from "./records"
import { UnknownToolError, ValidationError } from "./validate"

const database = createTestDatabase()

// The fields of the example D1.1 definition (workbooks/wb01/tools/d1-1.ts),
// copied because server/ cannot import a workbook. No one can approve D1.1,
// so they are tested under D1.3, where OM writes and PM approves. A select
// and an inherited field are added for the checks that need them.
tools.registerTool(
  defineTool({
    id: "D1.3",
    name: "Test D1.3",
    workbook: "wb01",
    fields: [
      { key: "clientName", label: "Client name", type: "text", required: true },
      {
        key: "clientEmail",
        label: "Client email",
        type: "text",
        required: true,
      },
      {
        key: "requestDescription",
        label: "Request description",
        type: "longText",
      },
      {
        key: "urgency",
        label: "Urgency",
        type: "select",
        options: ["Low", "High"],
      },
      {
        key: "clientReference",
        label: "Client reference",
        type: "text",
        inherited: { tool: "D1.1", field: "clientName" },
      },
    ],
  })
)

const ACME = { clientName: "Acme", clientEmail: "ops@acme.com" }

const BETA = { clientName: "Beta", clientEmail: "ops@beta.com" }

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
    payload: ACME,
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
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1789787898386', 'Tier_1') RETURNING id"
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
      payload: ACME,
    })

    expect(record.state).toBe("draft")
    expect(record.projectId).toBe(projectId)
    expect(record.toolId).toBe("D1.3")
    expect(record.payload).toEqual(ACME)
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

    const updated = await updateRecord(database, actor, record.id, BETA)

    expect(updated.payload).toEqual(BETA)
  })

  it.each(["submitted", "approved", "locked"] as const)(
    "refuses edits when the record is %s",
    async (state) => {
      const record = await newRecord(state)

      await expect(
        updateRecord(database, actor, record.id, BETA)
      ).rejects.toBeInstanceOf(RecordNotEditableError)
      expect((await getRecord(database, actor, record.id)).payload).toEqual(
        ACME
      )
    }
  )
})

// The fields named by the ValidationError the write was refused with.
async function refusedFields(write: Promise<ToolRecord>) {
  try {
    await write
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((entry) => entry.field).sort()
    }

    throw error
  }

  throw new Error("The write was saved, but it should have been refused")
}

function create(payload: JsonObject, toolId = "D1.3") {
  return createRecord(database, actor, { projectId, toolId, payload })
}

async function count(table: "tool_records" | "audit_log") {
  const { rows } = await database.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM ${table}`
  )

  return Number(rows[0]!.n)
}

describe("checking a payload against the tool definition", () => {
  it("saves a payload that matches the definition", async () => {
    const payload = {
      ...ACME,
      requestDescription: "A new boiler",
      urgency: "High",
    }

    const record = await create(payload)

    expect(record.payload).toEqual(payload)
  })

  it("saves a draft that is missing a required field", async () => {
    const record = await create({ clientEmail: "ops@acme.com" })

    expect(record.state).toBe("draft")
  })

  it("refuses to submit a draft missing a required field, and keeps it a draft", async () => {
    const record = await create({ clientEmail: "ops@acme.com" })

    expect(
      await refusedFields(
        transitionRecord(database, actor, record.id, "submitted")
      )
    ).toEqual(["clientName"])
    expect((await getRecord(database, actor, record.id)).state).toBe("draft")
  })

  it("counts an empty required text field as missing at submit", async () => {
    const record = await create({ clientName: "  ", clientEmail: "a@b.com" })

    expect(
      await refusedFields(
        transitionRecord(database, actor, record.id, "submitted")
      )
    ).toEqual(["clientName"])
  })

  it("submits once the required field is filled", async () => {
    const record = await create({ clientEmail: "ops@acme.com" })

    await updateRecord(database, actor, record.id, ACME)

    const moved = await transitionRecord(
      database,
      actor,
      record.id,
      "submitted"
    )

    expect(moved.state).toBe("submitted")
  })

  it("refuses a value of the wrong type", async () => {
    expect(await refusedFields(create({ clientName: 42 }))).toEqual([
      "clientName",
    ])
  })

  it("refuses a field the definition does not have", async () => {
    expect(await refusedFields(create({ ...ACME, budget: 100 }))).toEqual([
      "budget",
    ])
  })

  it("refuses a value for an inherited field", async () => {
    expect(
      await refusedFields(create({ ...ACME, clientReference: "Acme" }))
    ).toEqual(["clientReference"])
  })

  it("refuses a select value that is not one of its options", async () => {
    expect(await refusedFields(create({ ...ACME, urgency: "Medium" }))).toEqual(
      ["urgency"]
    )
  })

  it("returns every problem together", async () => {
    expect(
      await refusedFields(
        create({ clientName: 42, budget: 100, urgency: "Medium" })
      )
    ).toEqual(["budget", "clientName", "urgency"])
  })

  it("checks an update the same way", async () => {
    const record = await newRecord()

    expect(
      await refusedFields(
        updateRecord(database, actor, record.id, { ...ACME, urgency: "Soon" })
      )
    ).toEqual(["urgency"])
  })

  it("refuses a record for a tool with no definition", async () => {
    // OM can write D1.2, but D1.2 has no definition yet.
    await expect(create(ACME, "D1.2")).rejects.toBeInstanceOf(UnknownToolError)
    expect(await count("tool_records")).toBe(0)
  })

  it("stores nothing when a create is refused", async () => {
    await refusedFields(create({ clientName: 42 }))

    expect(await count("tool_records")).toBe(0)
    expect(await count("audit_log")).toBe(0)
  })

  it("stores nothing when an update is refused", async () => {
    const record = await newRecord()
    const lines = await count("audit_log")

    await refusedFields(
      updateRecord(database, actor, record.id, { clientName: 42 })
    )

    expect((await getRecord(database, actor, record.id)).payload).toEqual(ACME)
    expect(await count("audit_log")).toBe(lines)
  })

  it("stores nothing when a submit is refused", async () => {
    const record = await create({ clientEmail: "ops@acme.com" })
    const lines = await count("audit_log")

    await refusedFields(
      transitionRecord(database, actor, record.id, "submitted")
    )

    expect(await count("audit_log")).toBe(lines)
  })
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
      updateRecord(database, reader, record.id, BETA)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect((await getRecord(database, actor, record.id)).payload).toEqual(ACME)
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

describe("a project that is not active", () => {
  // Set directly, so these tests do not depend on who may change a status.
  async function setStatus(status: ProjectStatus) {
    await database.pool.query("UPDATE projects SET status = $1 WHERE id = $2", [
      status,
      projectId,
    ])
  }

  it.each(["on_hold", "rejected", "closed", "completed"] as const)(
    "refuses a new record when %s",
    async (status) => {
      await setStatus(status)

      await expect(
        createRecord(database, actor, {
          projectId,
          toolId: "D1.3",
          payload: ACME,
        })
      ).rejects.toBeInstanceOf(ProjectNotActiveError)
      expect(await count("tool_records")).toBe(0)
    }
  )

  it("refuses to submit a draft when on hold", async () => {
    const record = await newRecord()
    await setStatus("on_hold")

    await expect(
      transitionRecord(database, actor, record.id, "submitted")
    ).rejects.toBeInstanceOf(ProjectNotActiveError)
    expect((await getRecord(database, actor, record.id)).state).toBe("draft")
  })

  it("refuses to edit a draft when closed", async () => {
    const record = await newRecord()
    await setStatus("closed")

    await expect(
      updateRecord(database, actor, record.id, BETA)
    ).rejects.toBeInstanceOf(ProjectNotActiveError)
    expect((await getRecord(database, actor, record.id)).payload).toEqual(ACME)
  })

  it("still lets its records be read", async () => {
    const record = await newRecord()
    await setStatus("rejected")

    expect(await getRecord(database, actor, record.id)).toEqual(record)
  })

  it("takes new records again once the PM sets it back to active", async () => {
    await setProjectStatus(database, actor, projectId, "on_hold", "Client away")
    await setProjectStatus(database, actor, projectId, "active", "Client back")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D1.3",
      payload: ACME,
    })

    expect(record.state).toBe("draft")
  })
})
