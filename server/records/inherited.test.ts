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
// from the latest locked cycle. D1.4 takes its fields from the saved web
// request, which a CA may not read though they may read D1.4. D1.5 takes
// those answers on from D1.4 and from the Tier 3 briefing, and a Client may
// write D1.1, their own request.
const definitions = [
  defineTool({
    id: "D1.1",
    name: "Client Email / Web Form",
    workbook: "wb01",
    fields: [
      {
        key: "contactEmail",
        label: "Contact email",
        type: "email",
        inherited: { request: "email" },
      },
    ],
  }),
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
    fields: [
      { key: "clientName", label: "Client name", type: "text" },
      {
        key: "contactEmail",
        label: "Contact email",
        type: "email",
        inherited: { request: "email" },
      },
    ],
  }),
  defineTool({
    id: "D1.4",
    name: "Client acknowledgement",
    workbook: "wb01",
    fields: [
      {
        key: "contactEmail",
        label: "Contact email",
        type: "email",
        inherited: { request: "email" },
      },
      {
        key: "budget",
        label: "Budget",
        type: "text",
        inherited: { request: "budget_expectations" },
      },
      {
        key: "services",
        label: "Services",
        type: "text",
        inherited: {
          request: { Tier_1: "project_scope", Tier_3: "drafting_services" },
        },
      },
      { key: "note", label: "Note", type: "text" },
    ],
  }),
  defineTool({
    id: "D1.5",
    name: "Follow-up",
    workbook: "wb01",
    fields: [
      {
        key: "contactEmail",
        label: "Contact email",
        type: "email",
        inherited: { tool: "D1.4", field: "contactEmail" },
      },
      {
        key: "briefedEmail",
        label: "Briefed email",
        type: "email",
        inherited: { tool: "D1.3", field: "contactEmail" },
      },
      { key: "note", label: "Note", type: "text" },
    ],
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
      { tool: "D1.1" },
      { tool: "D1.3" },
      { tool: "T3.D1.3a" },
      { tool: "D1.4" },
      { tool: "D1.5" },
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

// The project's saved copy of the website row.
async function addRequest(
  submission: JsonObject,
  track: ServiceTrack = "Tier_1"
) {
  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [`T1-${crypto.randomUUID()}`, track, projectId, JSON.stringify(submission)]
  )
}

async function editRequest(submission: JsonObject) {
  await database.pool.query(
    "UPDATE intake_submissions SET submission = $2 WHERE project_id = $1",
    [projectId, JSON.stringify(submission)]
  )
}

async function addPersonWith(role: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Kofi', $1) RETURNING id",
    [`${crypto.randomUUID()}@example.com`]
  )

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [rows[0]!.id, projectId, role]
  )

  return rows[0]!.id
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

describe("a field linked to the saved web request", () => {
  it("shows the request's value", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    expect(await read(record)).toEqual({
      contactEmail: "ama@acme.example",
      note: "Sent",
    })
  })

  it("is refused when someone writes it", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    await expect(
      updateRecord(database, actor, record, {
        note: "Sent",
        contactEmail: "someone@else.example",
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await storedPayload(record)).toEqual({ note: "Sent" })
  })

  it.each([
    ["missing", {}],
    ["null", { budget_expectations: null }],
    ["blank", { budget_expectations: "   " }],
  ])("is empty when the request's value is %s", async (_, submission) => {
    await addRequest(submission)
    const record = await addRecord("D1.4", {})

    expect(await read(record)).not.toHaveProperty("budget")
  })

  it("is empty when the project has no saved request", async () => {
    const record = await addRecord("D1.4", { note: "Sent" })

    expect(await read(record)).toEqual({ note: "Sent" })
  })

  it("shows the new value once the request is edited", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", {})

    await editRequest({ email: "ama@acme-ltd.example" })

    expect((await read(record)).contactEmail).toBe("ama@acme-ltd.example")
  })

  it("shows a list answer as one line", async () => {
    await addRequest({ project_scope: ["Design", "Fabrication"] })
    const record = await addRecord("D1.4", {})

    expect((await read(record)).services).toBe("Design, Fabrication")
  })

  it("reads the column named for the request's tier", async () => {
    projectId = await addProject("Tier_3")
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
      [actor, projectId]
    )
    await addRequest(
      { project_scope: ["Wrong"], drafting_services: ["Scan", "Redraw"] },
      "Tier_3"
    )
    const record = await addRecord("D1.4", {})

    expect((await read(record)).services).toBe("Scan, Redraw")
  })

  it("does not write the live value into the stored draft", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    await read(record)

    expect(await storedPayload(record)).toEqual({ note: "Sent" })
  })

  it("is copied on submit and keeps that value when the request changes", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    await transitionRecord(database, actor, record, "submitted")
    await editRequest({ email: "ama@acme-ltd.example" })

    expect(await storedPayload(record)).toEqual({
      contactEmail: "ama@acme.example",
      note: "Sent",
    })
    expect((await read(record)).contactEmail).toBe("ama@acme.example")
  })
})

describe("a person who may not read the request", () => {
  // The CA reads D1.4 and D1.5 but not D1.1, the client's request.
  async function asOutsider(recordId: string) {
    const ca = await addPersonWith("CA")

    return (await getRecord(database, ca, recordId)).payload
  }

  it("does not see the value on a draft, but sees the rest", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    expect(await asOutsider(record)).toEqual({ note: "Sent" })
  })

  it("does not see the value once it is frozen in the payload", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", { note: "Sent" })

    await transitionRecord(database, actor, record, "submitted")

    expect(await asOutsider(record)).toEqual({ note: "Sent" })
  })

  it("does not see it through a tool that inherits the frozen value", async () => {
    await addRequest({ email: "ama@acme.example" })
    await addRecord(
      "D1.4",
      { contactEmail: "ama@acme.example" },
      { state: "locked" }
    )
    const record = await addRecord("D1.5", { note: "Called" })

    expect((await read(record)).contactEmail).toBe("ama@acme.example")
    expect(await asOutsider(record)).toEqual({ note: "Called" })
  })

  it("does not see it through the tool that replaces the source on the track", async () => {
    projectId = await addProject("Tier_3")
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
      [actor, projectId]
    )
    await addRecord(
      "T3.D1.3a",
      { contactEmail: "ama@acme.example" },
      { state: "locked" }
    )
    const record = await addRecord("D1.5", { note: "Called" })

    expect((await read(record)).briefedEmail).toBe("ama@acme.example")
    expect(await asOutsider(record)).toEqual({ note: "Called" })
  })

  it("still freezes the real value when the Client submits", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.1", {})
    const client = await addPersonWith("Client")

    await transitionRecord(database, client, record, "submitted")

    expect(await storedPayload(record)).toEqual({
      contactEmail: "ama@acme.example",
    })
  })

  it("leaves staff who also hold the Client role able to see it", async () => {
    await addRequest({ email: "ama@acme.example" })
    const record = await addRecord("D1.4", {})

    expect((await read(record)).contactEmail).toBe("ama@acme.example")
  })
})
