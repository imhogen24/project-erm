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
  type JsonObject,
} from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { payloadChanges } from "./audit"

const database = createTestDatabase()

// `boom` is a field so a payload holding it passes the definition check and
// reaches the log, where the test trigger refuses it.
tools.registerTool(
  defineTool({
    id: "D1.3",
    name: "Test D1.3",
    workbook: "wb01",
    fields: [
      { key: "client", label: "Client", type: "text" },
      { key: "site", label: "Site", type: "text" },
      { key: "units", label: "Units", type: "number" },
      { key: "urgent", label: "Urgent", type: "boolean" },
      { key: "boom", label: "Boom", type: "number" },
    ],
  })
)

let projectId: string

let actor: string

type Line = {
  record_id: string
  project_id: string
  actor_id: string
  action: string
  field: string
  old_value: unknown
  new_value: unknown
  created_at: Date
}

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

function newRecord(payload: JsonObject = { client: "Acme" }) {
  return createRecord(database, actor, {
    projectId,
    toolId: "D1.3",
    payload,
  })
}

async function lines(recordId: string) {
  const { rows } = await database.pool.query<Line>(
    "SELECT record_id, project_id, actor_id, action, field, old_value, new_value, created_at FROM audit_log WHERE record_id = $1 ORDER BY field, created_at",
    [recordId]
  )

  return rows
}

// The parts of a line that the tests compare, without ids and times.
function summary(found: Line[]) {
  return found.map((line) => [
    line.action,
    line.field,
    line.old_value,
    line.new_value,
  ])
}

async function totalLines() {
  const { rows } = await database.pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM audit_log"
  )

  return Number(rows[0]!.n)
}

async function recordCount() {
  const { rows } = await database.pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM tool_records"
  )

  return Number(rows[0]!.n)
}

// Makes the log refuse the one line that mentions `boom`, to prove that a
// failing log line undoes the change next to it.
async function refuseBoomLines() {
  await database.pool.query(`
    CREATE OR REPLACE FUNCTION refuse_boom() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'log line refused for the test';
    END;
    $$ LANGUAGE plpgsql
  `)

  await database.pool.query(`
    CREATE TRIGGER refuse_boom BEFORE INSERT ON audit_log
    FOR EACH ROW WHEN (NEW.field = 'payload.boom')
    EXECUTE FUNCTION refuse_boom()
  `)
}

async function allowBoomLines() {
  await database.pool.query("DROP TRIGGER IF EXISTS refuse_boom ON audit_log")
  await database.pool.query("DROP FUNCTION IF EXISTS refuse_boom()")
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
  await allowBoomLines()
  await database.pool.end()
})

describe("creating a record", () => {
  it("writes a state line and a line for each payload field", async () => {
    const record = await newRecord({ client: "Acme", site: "Tema" })

    expect(summary(await lines(record.id))).toEqual([
      ["created", "payload.client", null, "Acme"],
      ["created", "payload.site", null, "Tema"],
      ["created", "state", null, "draft"],
    ])
  })

  it("keeps the actor, project, record and a time on every line", async () => {
    const record = await newRecord()

    const found = await lines(record.id)

    expect(found).toHaveLength(2)

    for (const line of found) {
      expect(line.actor_id).toBe(actor)
      expect(line.project_id).toBe(projectId)
      expect(line.record_id).toBe(record.id)
      expect(line.created_at).toBeInstanceOf(Date)
    }
  })

  it("writes only the state line when the payload is empty", async () => {
    const record = await newRecord({})

    expect(summary(await lines(record.id))).toEqual([
      ["created", "state", null, "draft"],
    ])
  })
})

describe("editing a record", () => {
  it("writes one line for the field that changed", async () => {
    const record = await newRecord()

    await updateRecord(database, actor, record.id, { client: "Beta" })

    const edits = (await lines(record.id)).filter(
      (line) => line.action === "updated"
    )

    expect(summary(edits)).toEqual([
      ["updated", "payload.client", "Acme", "Beta"],
    ])
    expect(edits[0]!.actor_id).toBe(actor)
  })

  it("writes nothing when the payload is saved unchanged", async () => {
    const record = await newRecord()
    const before = await totalLines()

    await updateRecord(database, actor, record.id, { client: "Acme" })

    expect(await totalLines()).toBe(before)
  })

  it("writes only the fields that changed", async () => {
    const record = await newRecord({ client: "Acme", site: "Tema" })

    await updateRecord(database, actor, record.id, {
      client: "Acme",
      site: "Takoradi",
    })

    const edits = (await lines(record.id)).filter(
      (line) => line.action === "updated"
    )

    expect(summary(edits)).toEqual([
      ["updated", "payload.site", "Tema", "Takoradi"],
    ])
  })

  it("writes a line for a field that is added and one for a field that is removed", async () => {
    const record = await newRecord({ client: "Acme" })

    await updateRecord(database, actor, record.id, { site: "Tema" })

    const edits = (await lines(record.id)).filter(
      (line) => line.action === "updated"
    )

    expect(summary(edits)).toEqual([
      ["updated", "payload.client", "Acme", null],
      ["updated", "payload.site", null, "Tema"],
    ])
  })

  // A tool definition has no nested fields, so this is checked on the diff
  // itself rather than through a saved record.
  it("treats an unchanged nested value as unchanged", () => {
    expect(
      payloadChanges(
        { contact: { name: "Ama", phone: "024" } },
        { contact: { name: "Ama", phone: "024" } }
      )
    ).toEqual([])
  })

  it("keeps numbers and booleans as they are", async () => {
    const record = await newRecord({ units: 2, urgent: false })

    await updateRecord(database, actor, record.id, { units: 3, urgent: true })

    const edits = (await lines(record.id)).filter(
      (line) => line.action === "updated"
    )

    expect(summary(edits)).toEqual([
      ["updated", "payload.units", 2, 3],
      ["updated", "payload.urgent", false, true],
    ])
  })
})

describe("moving a record", () => {
  it("writes one state line", async () => {
    const record = await newRecord()

    await transitionRecord(database, actor, record.id, "submitted")

    const moves = (await lines(record.id)).filter(
      (line) => line.action === "transitioned"
    )

    expect(summary(moves)).toEqual([
      ["transitioned", "state", "draft", "submitted"],
    ])
    expect(moves[0]!.actor_id).toBe(actor)
  })

  it("writes a line for every step of a longer walk", async () => {
    const record = await newRecord()

    for (const step of ["submitted", "approved", "locked"] as const) {
      await transitionRecord(database, actor, record.id, step)
    }

    const moves = (await lines(record.id)).filter(
      (line) => line.action === "transitioned"
    )

    expect(summary(moves)).toEqual([
      ["transitioned", "state", "draft", "submitted"],
      ["transitioned", "state", "submitted", "approved"],
      ["transitioned", "state", "approved", "locked"],
    ])
  })
})

describe("refused operations", () => {
  it("write nothing for an invalid move", async () => {
    const record = await newRecord()
    const before = await totalLines()

    await expect(
      transitionRecord(database, actor, record.id, "locked")
    ).rejects.toBeInstanceOf(InvalidTransitionError)
    expect(await totalLines()).toBe(before)
  })

  it("write nothing for a permission denial", async () => {
    const record = await newRecord()
    const reader = await addActor(["Client"])
    const before = await totalLines()

    await expect(
      updateRecord(database, reader, record.id, { client: "Beta" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    await expect(
      transitionRecord(database, reader, record.id, "submitted")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await totalLines()).toBe(before)
  })

  it("write nothing for an edit of a record that is not a draft", async () => {
    const record = await newRecord()

    await transitionRecord(database, actor, record.id, "submitted")

    const before = await totalLines()

    await expect(
      updateRecord(database, actor, record.id, { client: "Beta" })
    ).rejects.toBeInstanceOf(RecordNotEditableError)
    expect(await totalLines()).toBe(before)
  })

  it("write nothing for a create that is refused", async () => {
    const reader = await addActor(["Client"])

    await expect(
      createRecord(database, reader, { projectId, toolId: "D1.3" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(await totalLines()).toBe(0)
  })

  it("are not logged when a record is only read", async () => {
    const record = await newRecord()
    const before = await totalLines()

    await getRecord(database, actor, record.id)

    expect(await totalLines()).toBe(before)
  })
})

describe("the log and the change succeed or fail together", () => {
  it("undoes an edit when its log line fails", async () => {
    const record = await newRecord()

    await refuseBoomLines()

    try {
      await expect(
        updateRecord(database, actor, record.id, { client: "Beta", boom: 1 })
      ).rejects.toThrow()
    } finally {
      await allowBoomLines()
    }

    expect((await getRecord(database, actor, record.id)).payload).toEqual({
      client: "Acme",
    })
    expect(
      (await lines(record.id)).filter((line) => line.action === "updated")
    ).toEqual([])
  })

  it("adds no record when the log lines for a create fail", async () => {
    await refuseBoomLines()

    try {
      await expect(newRecord({ client: "Acme", boom: 1 })).rejects.toThrow()
    } finally {
      await allowBoomLines()
    }

    expect(await recordCount()).toBe(0)
    expect(await totalLines()).toBe(0)
  })

  it("does not move a record when its log line fails", async () => {
    const record = await newRecord()

    await database.pool.query(`
      CREATE OR REPLACE FUNCTION refuse_state() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'log line refused for the test';
      END;
      $$ LANGUAGE plpgsql
    `)

    await database.pool.query(`
      CREATE TRIGGER refuse_state BEFORE INSERT ON audit_log
      FOR EACH ROW WHEN (NEW.action = 'transitioned')
      EXECUTE FUNCTION refuse_state()
    `)

    try {
      await expect(
        transitionRecord(database, actor, record.id, "submitted")
      ).rejects.toThrow()
    } finally {
      await database.pool.query(
        "DROP TRIGGER IF EXISTS refuse_state ON audit_log"
      )
      await database.pool.query("DROP FUNCTION IF EXISTS refuse_state()")
    }

    expect((await getRecord(database, actor, record.id)).state).toBe("draft")
  })

  it("writes exactly one state line when two submits run at once", async () => {
    const record = await newRecord()

    const results = await Promise.allSettled([
      transitionRecord(database, actor, record.id, "submitted"),
      transitionRecord(database, actor, record.id, "submitted"),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)

    const moves = (await lines(record.id)).filter(
      (line) => line.action === "transitioned"
    )

    expect(summary(moves)).toEqual([
      ["transitioned", "state", "draft", "submitted"],
    ])
  })
})

describe("protecting the log", () => {
  it("refuses an UPDATE of a log line", async () => {
    const record = await newRecord()

    await expect(
      database.pool.query(
        "UPDATE audit_log SET new_value = '\"hacked\"' WHERE record_id = $1",
        [record.id]
      )
    ).rejects.toThrow()
    expect(
      (await lines(record.id)).map((line) => line.new_value)
    ).not.toContain("hacked")
  })

  it("refuses a DELETE of a log line", async () => {
    const record = await newRecord()
    const before = await totalLines()

    await expect(
      database.pool.query("DELETE FROM audit_log WHERE record_id = $1", [
        record.id,
      ])
    ).rejects.toThrow()
    expect(await totalLines()).toBe(before)
  })

  it("lets the tests empty the table between runs", async () => {
    await newRecord()

    await resetTestData(database)

    expect(await totalLines()).toBe(0)
  })
})
