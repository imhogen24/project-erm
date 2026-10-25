import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type RecordState, type ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { loadWorkflow } from "@/server/workflow/workflow"

import {
  ValidationError,
  getRecord,
  transitionRecord,
  updateRecord,
  type JsonObject,
} from "./records"

const database = createTestDatabase()

// D1.15 takes the client's name from D1.3, as in WB01. On a Tier 3 project
// T3.D1.3a takes the place of D1.3. In WB03, D3.5 repeats with D3.4 and takes
// its amount from the same cycle. D4.1 does not repeat, so it takes the amount
// from the latest locked cycle.
const definitions = [
  defineTool({
    id: "D1.3",
    name: "Initial client briefing",
    workbook: "wb01",
    tier: 1,
    fields: [
      { key: "clientName", label: "Client name", type: "text" },
      { key: "note", label: "Note", type: "text" },
    ],
  }),
  defineTool({
    id: "T3.D1.3a",
    name: "Tier 3 client briefing",
    workbook: "wb01",
    tier: 3,
    replaces: "D1.3",
    fields: [{ key: "clientName", label: "Client name", type: "text" }],
  }),
  defineTool({
    id: "D1.15",
    name: "Project summary",
    workbook: "wb01",
    fields: [
      {
        key: "clientName",
        label: "Client name",
        type: "text",
        inherited: { tool: "D1.3", field: "clientName" },
      },
      {
        key: "budget",
        label: "Budget",
        type: "text",
        inherited: { tool: "D1.3", field: "budget" },
      },
      { key: "summary", label: "Summary", type: "text", required: true },
    ],
  }),
  defineTool({
    id: "D3.1",
    name: "Payment terms",
    workbook: "wb03",
    fields: [{ key: "milestones", label: "Milestones", type: "number" }],
  }),
  defineTool({
    id: "D3.4",
    name: "Invoice",
    workbook: "wb03",
    fields: [{ key: "amount", label: "Amount", type: "currency" }],
  }),
  defineTool({
    id: "D3.5",
    name: "Payment received",
    workbook: "wb03",
    fields: [
      {
        key: "amount",
        label: "Amount",
        type: "currency",
        inherited: { tool: "D3.4", field: "amount" },
      },
    ],
  }),
  defineTool({
    id: "D3.10",
    name: "Next stage notice",
    workbook: "wb03",
    fields: [{ key: "note", label: "Note", type: "text" }],
  }),
  defineTool({
    id: "D4.1",
    name: "Capacity check",
    workbook: "wb04",
    fields: [
      {
        key: "lastInvoice",
        label: "Last invoice",
        type: "currency",
        inherited: { tool: "D3.4", field: "amount" },
      },
    ],
  }),
]

for (const definition of definitions) {
  tools.registerTool(definition)
}

loadWorkflow([
  {
    workbook: "wb01",
    tools: [
      { tool: "D1.3" },
      { tool: "T3.D1.3a" },
      { tool: "D1.15", after: { all: ["D1.3"] } },
    ],
  },
  { workbook: "wb02", opens: { after: { all: ["D1.15"] } }, tools: [] },
  {
    workbook: "wb03",
    opens: { after: { all: ["D1.15"] } },
    cycles: { count: { tool: "D3.1", field: "milestones" }, closedBy: "D3.10" },
    tools: [
      { tool: "D3.1" },
      { tool: "D3.4", after: { all: ["D3.1"] }, repeats: true },
      { tool: "D3.5", after: { all: ["D3.4"] }, repeats: true },
      { tool: "D3.10", after: { all: ["D3.5"] }, repeats: true },
    ],
  },
  {
    workbook: "wb04",
    opens: { after: { all: ["D3.10"] } },
    tools: [{ tool: "D4.1" }],
  },
  {
    workbook: "wb05",
    opens: { after: { all: ["D4.1"] }, tracks: ["Tier_1"] },
    tools: [],
  },
])

let projectId: string

// Holds every role, so permissions never get in the way.
let actor: string

async function addProject(track: ServiceTrack = "Tier_1") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, $2) RETURNING id",
    [`T1-${crypto.randomUUID()}`, track]
  )

  return rows[0]!.id
}

// Inserted directly, so a test can set up any state and cycle without walking
// the route.
async function addRecord(
  toolId: string,
  payload: JsonObject,
  { state = "draft", cycle = 1 }: { state?: RecordState; cycle?: number } = {}
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [projectId, toolId, cycle, state, JSON.stringify(payload)]
  )

  return rows[0]!.id
}

async function setPayload(recordId: string, payload: JsonObject) {
  await database.pool.query(
    "UPDATE tool_records SET payload = $2 WHERE id = $1",
    [recordId, JSON.stringify(payload)]
  )
}

async function setState(recordId: string, state: RecordState) {
  await database.pool.query(
    "UPDATE tool_records SET state = $2 WHERE id = $1",
    [recordId, state]
  )
}

async function storedPayload(recordId: string) {
  const { rows } = await database.pool.query<{ payload: JsonObject }>(
    "SELECT payload FROM tool_records WHERE id = $1",
    [recordId]
  )

  return rows[0]!.payload
}

async function read(recordId: string) {
  return (await getRecord(database, actor, recordId)).payload
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', 'ama@example.com') RETURNING id"
  )

  actor = rows[0]!.id

  for (const role of roles) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [actor, projectId, role]
    )
  }
})

afterAll(async () => {
  await database.pool.end()
})

describe("reading a draft", () => {
  it("shows the source's value in the inherited field", async () => {
    await addRecord("D1.3", { clientName: "Acme" }, { state: "locked" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    expect(await read(summary)).toEqual({
      clientName: "Acme",
      summary: "Boiler refit",
    })
  })

  it("shows the new value once the source is edited", async () => {
    const briefing = await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await updateRecord(database, actor, briefing, { clientName: "Acme Ltd" })

    expect((await read(summary)).clientName).toBe("Acme Ltd")
  })

  it("leaves the field empty when the source tool has no record", async () => {
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    expect(await read(summary)).toEqual({ summary: "Boiler refit" })
  })

  it("leaves the field empty when the source record does not have it", async () => {
    await addRecord("D1.3", { clientName: "Acme" }, { state: "locked" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    expect(await read(summary)).not.toHaveProperty("budget")
  })

  it("uses the new source record, never the void one", async () => {
    await addRecord("D1.3", { clientName: "Old Acme" }, { state: "void" })
    await addRecord("D1.3", { clientName: "New Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    expect((await read(summary)).clientName).toBe("New Acme")
  })

  it("never uses a void source, even when it is the only one", async () => {
    await addRecord("D1.3", { clientName: "Old Acme" }, { state: "void" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    expect(await read(summary)).not.toHaveProperty("clientName")
  })

  it("reads from the tool that replaces the source on the project's track", async () => {
    projectId = await addProject("Tier_3")
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
      [actor, projectId]
    )
    await addRecord("T3.D1.3a", { clientName: "Drafting Co" })
    const summary = await addRecord("D1.15", { summary: "Scan a part" })

    expect((await read(summary)).clientName).toBe("Drafting Co")
  })

  it("takes a repeating source from the same cycle when the record repeats too", async () => {
    await addRecord("D3.4", { amount: 100 }, { state: "locked", cycle: 1 })
    await addRecord("D3.4", { amount: 250 }, { cycle: 2 })
    const first = await addRecord("D3.5", {}, { cycle: 1 })
    const second = await addRecord("D3.5", {}, { cycle: 2 })

    expect(await read(first)).toEqual({ amount: 100 })
    expect(await read(second)).toEqual({ amount: 250 })
  })

  it("takes a repeating source from the latest locked cycle when the record does not repeat", async () => {
    await addRecord("D3.4", { amount: 100 }, { state: "locked", cycle: 1 })
    await addRecord("D3.4", { amount: 250 }, { state: "locked", cycle: 2 })
    await addRecord("D3.4", { amount: 900 }, { cycle: 3 })
    const capacity = await addRecord("D4.1", {})

    expect(await read(capacity)).toEqual({ lastInvoice: 250 })
  })

  it("leaves the field empty when no cycle of a repeating source is locked", async () => {
    await addRecord("D3.4", { amount: 100 }, { cycle: 1 })
    const capacity = await addRecord("D4.1", {})

    expect(await read(capacity)).toEqual({})
  })

  it("does not write the live value into the stored draft", async () => {
    await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await read(summary)

    expect(await storedPayload(summary)).toEqual({ summary: "Boiler refit" })
  })
})

describe("submitting", () => {
  it("copies the inherited values into the payload", async () => {
    await addRecord("D1.3", { clientName: "Acme" }, { state: "locked" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    const submitted = await transitionRecord(
      database,
      actor,
      summary,
      "submitted"
    )

    expect(submitted.payload).toEqual({
      clientName: "Acme",
      summary: "Boiler refit",
    })
    expect(await storedPayload(summary)).toEqual(submitted.payload)
  })

  it("writes an audit line for the copy, next to the state change", async () => {
    await addRecord("D1.3", { clientName: "Acme" }, { state: "locked" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await transitionRecord(database, actor, summary, "submitted")

    const { rows } = await database.pool.query(
      `SELECT action, field, old_value, new_value, actor_id, reason
       FROM audit_log WHERE record_id = $1 ORDER BY field`,
      [summary]
    )

    expect(rows).toEqual([
      {
        action: "updated",
        field: "payload.clientName",
        old_value: null,
        new_value: "Acme",
        actor_id: actor,
        reason: "Inherited values copied on submit",
      },
      {
        action: "transitioned",
        field: "state",
        old_value: "draft",
        new_value: "submitted",
        actor_id: actor,
        reason: null,
      },
    ])
  })

  it("keeps the frozen value when the source changes later", async () => {
    const briefing = await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await transitionRecord(database, actor, summary, "submitted")
    await updateRecord(database, actor, briefing, { clientName: "Acme Ltd" })

    expect((await read(summary)).clientName).toBe("Acme")
  })

  it("keeps the frozen value when the source is voided", async () => {
    const briefing = await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await transitionRecord(database, actor, summary, "submitted")
    await setState(briefing, "void")

    expect((await read(summary)).clientName).toBe("Acme")
  })

  it("is not blocked when there is no source record", async () => {
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    const submitted = await transitionRecord(
      database,
      actor,
      summary,
      "submitted"
    )

    expect(submitted.state).toBe("submitted")
    expect(submitted.payload).toEqual({ summary: "Boiler refit" })
  })

  it("writes no copy line when there is nothing to copy", async () => {
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await transitionRecord(database, actor, summary, "submitted")

    const { rows } = await database.pool.query(
      "SELECT action FROM audit_log WHERE record_id = $1",
      [summary]
    )

    expect(rows).toEqual([{ action: "transitioned" }])
  })

  it("reads live again once sent back to draft, and can be submitted again", async () => {
    const briefing = await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await transitionRecord(database, actor, summary, "submitted")
    await transitionRecord(database, actor, summary, "draft")
    await setPayload(briefing, { clientName: "Acme Ltd" })

    expect((await read(summary)).clientName).toBe("Acme Ltd")

    const again = await transitionRecord(database, actor, summary, "submitted")

    expect(again.payload).toEqual({
      clientName: "Acme Ltd",
      summary: "Boiler refit",
    })
  })
})

describe("writing an inherited field", () => {
  it("is still refused", async () => {
    await addRecord("D1.3", { clientName: "Acme" })
    const summary = await addRecord("D1.15", { summary: "Boiler refit" })

    await expect(
      updateRecord(database, actor, summary, {
        summary: "Boiler refit",
        clientName: "Someone else",
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await storedPayload(summary)).toEqual({ summary: "Boiler refit" })
  })
})
