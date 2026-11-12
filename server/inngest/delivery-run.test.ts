import { InngestTestEngine } from "@inngest/test"
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
import { sendAcknowledgement } from "@/server/acknowledgement/acknowledgement"
import { createFakeTransport, type DeliveryLookup } from "@/server/email/email"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { createDeliveryRun } from "./delivery-run"
import { functions } from "./functions"

// The job that checks D1.4 emails (RDP-151). What it decides is tested in
// server/acknowledgement/delivery.test.ts; this checks it is served, runs on
// its own, and never fails a run.
const database = createTestDatabase()

// A stand-in for D1.4 with the fields Send and the delivery check use. The real definition is
// checked in workbooks/wb01/tools/d1-4.test.ts.
tools.registerTool(
  defineTool({
    id: "D1.4",
    name: "Acknowledgement Email",
    workbook: "wb01",
    autosave: true,
    fields: [
      { key: "sentTo", label: "Sent To", type: "email", systemFilled: true },
      { key: "ccBcc", label: "CC / BCC", type: "text" },
      { key: "subject", label: "Subject Line", type: "text", required: true },
      { key: "sentBy", label: "Sent By", type: "text", systemFilled: true },
      { key: "dateSent", label: "Date Sent", type: "date", systemFilled: true },
      { key: "timeSent", label: "Time Sent", type: "time", systemFilled: true },
      {
        key: "deliveryStatus",
        label: "Delivery Status",
        type: "select",
        options: ["Sent", "Delivered", "Bounced"],
        systemFilled: true,
      },
      { key: "body", label: "Body", type: "longText", required: true },
    ],
  })
)

loadUnorderedWorkflow({ wb01: ["D1.4"] })

const clientEmail = "kwaku.ampofo@temafoods.test"

const delivered: DeliveryLookup = {
  name: "fake",
  status: async () => "delivered",
}

// An error that quotes the client, as a failing service might.
const unreachable: DeliveryLookup = {
  name: "unreachable",
  status: async () => {
    throw new Error(`Could not reach Resend for ${clientEmail}`)
  },
}

function execute(lookup: DeliveryLookup) {
  return new InngestTestEngine({
    function: createDeliveryRun({ database: () => database, lookup }),
  }).execute()
}

let recordId: string

async function deliveryStatus() {
  const { rows } = await database.pool.query<{ payload: JsonObject }>(
    "SELECT payload FROM tool_records WHERE id = $1",
    [recordId]
  )

  return rows[0]!.payload.deliveryStatus
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  const { rows: project } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-100', 'Tier_1') RETURNING id"
  )

  const projectId = project[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-100', 'Tier_1', $1, $2)",
    [projectId, { email: clientEmail }]
  )

  const { rows: person } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', 'ama@example.com') RETURNING id"
  )

  const pm = person[0]!.id

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
    [pm, projectId]
  )

  const { rows: record } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.4', 'draft', $2) RETURNING id",
    [projectId, { subject: "Acknowledgement", body: "Dear Kwaku," }]
  )

  recordId = record[0]!.id

  await sendAcknowledgement(database, pm, recordId, createFakeTransport())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await database.pool.end()
})

describe("delivery-run", () => {
  it("is served, and runs every 5 minutes, one run at a time", () => {
    const served = functions.find((fn) => fn.id() === "delivery-run")

    expect(served).toBeDefined()
    expect(served!.opts.triggers).toEqual([{ cron: "*/5 * * * *" }])
    expect(served!.opts.concurrency).toEqual({ limit: 1 })
  })

  it("checks the emails at Sent", async () => {
    const { error } = await execute(delivered)

    expect(error).toBeUndefined()
    expect(await deliveryStatus()).toBe("Delivered")
  })

  it("does not fail when the email service cannot be reached", async () => {
    const { result, error } = await execute(unreachable)

    expect(error).toBeUndefined()
    expect(await deliveryStatus()).toBe("Sent")
    expect(JSON.stringify(result)).not.toContain(clientEmail)
  })
})
