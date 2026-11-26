import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { PROCEED } from "@/lib/billing-trigger"
import { paymentStatuses, shownDate } from "@/lib/payment-record"
import { DIGITAL } from "@/lib/signature-contract"
import { paymentRecordValues } from "@/server/payments/payment-record"
import { can } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  saveDraft,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d31 } from "./d3-1"
import { d32 } from "./d3-2"
import { d33 } from "./d3-3"
import { d34 } from "./d3-4"
import { d35 } from "./d3-5"
import { d36 } from "./d3-6"
import { d37 } from "./d3-7"
import { d38 } from "./d3-8"
import { d39 } from "./d3-9"
import { d310 } from "./d3-10"

const database = createTestDatabase()

for (const tool of [d31, d32, d33, d34, d35, d36, d37, d38, d39, d310]) {
  tools.registerTool(tool)
}

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.11", "D2.12", "D2.14"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.11", "D2.12", "D2.14"],
})

const TODAY = "2027-03-01"

let projectId: string

let fo: string

let pm: string

async function addProject() {
  const requestId = `Tier_1-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, 'Tier_1') RETURNING id",
    [requestId]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@imhogen.test`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(
  toolId: string,
  payload: JsonObject = {},
  cycle = 1,
  lockedAt = "2027-01-04T09:00:00Z"
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, $3, 'locked', $4, $5, $5)",
    [projectId, toolId, cycle, payload, lockedAt]
  )
}

// D3.1 locked on 4 Jan 2027 with its three milestones and Net 21 Days, the
// contract signed in the app on 2 Jan 2027, and D2.12 with the advance
// invoiced on `invoiced`.
async function lockTerms(invoiced = "2027-01-02") {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6"]) {
    await addRecord(toolId)
  }

  await addRecord("D2.11", {
    routingMethod: DIGITAL,
    heSignature: { signedBy: "Kofi Mensah", signedAt: "2027-01-02T12:00:00Z" },
  })
  await addRecord("D2.12", { invoiceDate: invoiced })
  await addRecord("D3.1", {
    paymentSchedule: [
      { milestone: "Advance Payment", percentage: 40, amountDue: 69400 },
      { milestone: "Fabrication Milestone", percentage: 40, amountDue: 69400 },
      { milestone: "Final Handover", percentage: 20, amountDue: 34700 },
    ],
    complianceRules: [{ term: "Net 21 Days from Invoice Issuance" }],
  })
}

async function shown(payload: JsonObject | null = null, today = TODAY) {
  return paymentRecordValues(
    database,
    projectId,
    payload ? { payload } : null,
    today
  )
}

// 2.0's rows as shown, each with its SN and the rest of its cells.
const scheduleRows = z.array(z.looseObject({ sn: z.string() }))

function rowsOf(values: JsonObject) {
  return scheduleRows.parse(values.paymentSchedule)
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  projectId = await addProject()
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("the definition", () => {
  it("is a living record with no Submit, its schedule read from D3.1's", () => {
    expect(d32.living).toBe(true)
    expect(d32.withoutSubmit).toBe(true)

    const schedule = d32.fields.find((field) => field.key === "paymentSchedule")

    expect(schedule).toMatchObject({
      rowsFrom: { tool: "D3.1", field: "paymentSchedule", keyedBy: "sn" },
    })
  })
})

describe("the status of each milestone", () => {
  it("is on time or late against the window after the invoice", () => {
    expect(
      paymentStatuses(
        [
          { invoiced: "2027-01-02", cleared: "2027-01-23" },
          { invoiced: "2027-01-02", cleared: "2027-01-24" },
          { invoiced: "2027-01-02", cleared: "2027-01-28" },
        ],
        21,
        TODAY
      )
    ).toEqual([
      "Cleared On Time",
      "Cleared Late (1 day)",
      "Cleared Late (5 days)",
    ])
  })

  it("awaits payment within the window and is overdue after it", () => {
    expect(
      paymentStatuses(
        [{ invoiced: "2027-02-20" }, { invoiced: "2027-02-01" }],
        21,
        TODAY
      )
    ).toEqual(["Awaiting Payment", "Overdue (7 days)"])
  })

  it("names what the next milestone waits on, and leaves the rest Pending", () => {
    expect(paymentStatuses([{}, {}, {}], 21, TODAY)).toEqual([
      "Awaiting Advance Invoice",
      "Pending",
      "Pending",
    ])
    expect(
      paymentStatuses(
        [{ invoiced: "2027-01-02", cleared: "2027-01-10" }, {}, {}],
        21,
        TODAY
      )
    ).toEqual(["Cleared On Time", "Awaiting D3.3 Trigger", "Pending"])
  })

  it("shows a date as the ledger reads it, or Pending", () => {
    expect(shownDate("2027-01-02")).toBe("2 Jan 2027")
    expect(shownDate(undefined)).toBe("Pending")
  })
})

describe("what D3.2 shows", () => {
  it("opens once D3.1 locks", async () => {
    await lockTerms()

    expect(
      (await availableTools(database, projectId)).filter(
        (each) => each.toolId === "D3.2"
      )
    ).toEqual([{ toolId: "D3.2", cycle: 1 }])
  })

  it("fills 1.0 and one row per D3.1 milestone, row 2.1 starting on the execution date", async () => {
    await lockTerms()

    const values = await shown()

    expect(values).toMatchObject({
      requestId: expect.stringMatching(/^Tier_1-/),
      trackingOfficer: "Esi Badu",
      dateInitiated: "2027-01-04",
      totalCleared: "GHS 0.00",
    })
    expect(rowsOf(values)).toEqual([
      {
        sn: "2.1",
        milestone: "Advance Payment",
        expectedAmount: "GHS 69,400.00",
        expectedTriggerDate: "2027-01-02",
        actualInvoiceDate: "2 Jan 2027",
        actualClearanceDate: "Pending",
        status: "Overdue (37 days)",
      },
      {
        sn: "2.2",
        milestone: "Fabrication Milestone",
        expectedAmount: "GHS 69,400.00",
        actualInvoiceDate: "Pending",
        actualClearanceDate: "Pending",
        status: "Awaiting D3.3 Trigger",
      },
      {
        sn: "2.3",
        milestone: "Final Handover",
        expectedAmount: "GHS 34,700.00",
        actualInvoiceDate: "Pending",
        actualClearanceDate: "Pending",
        status: "Pending",
      },
    ])
  })

  it("shows the advance cleared from D2.14, and counts it in the totals", async () => {
    await lockTerms()
    await addRecord("D2.14", { paymentDate: "2027-01-15" })

    const values = await shown()

    expect(rowsOf(values)[0]).toMatchObject({
      actualClearanceDate: "15 Jan 2027",
      status: "Cleared On Time",
    })
    expect(values.totalCleared).toBe("GHS 69,400.00")
  })

  it("shows a cycle's milestone invoiced at D3.6 and cleared at D3.8, at the reconciled amount", async () => {
    await lockTerms()
    await addRecord("D2.14", { paymentDate: "2027-01-15" })
    await addRecord("D3.3", {
      milestone: "2.2 Fabrication Milestone",
      actionTaken: PROCEED,
    })
    await addRecord("D3.6", { dateSent: "2027-02-01" })
    await addRecord("D3.8", {
      fundsAccounted: "Yes",
      actualCleared: 69390,
      dateCleared: "2027-02-25",
    })

    const values = await shown()

    expect(rowsOf(values)[1]).toMatchObject({
      actualInvoiceDate: "1 Feb 2027",
      actualClearanceDate: "25 Feb 2027",
      status: "Cleared Late (3 days)",
    })
    expect(rowsOf(values)[2]).toMatchObject({
      status: "Awaiting D3.3 Trigger",
    })
    expect(values.totalCleared).toBe("GHS 138,790.00")
  })

  it("leaves a D3.8 not yet approved with the funds accounted for out", async () => {
    await lockTerms()
    await addRecord("D3.3", { milestone: "2.2 Fabrication Milestone" })
    await addRecord("D3.6", { dateSent: "2027-02-20" })
    await addRecord("D3.8", { fundsAccounted: "No", dateCleared: "2027-02-25" })

    expect(rowsOf(await shown())[1]).toMatchObject({
      actualClearanceDate: "Pending",
      status: "Awaiting Payment",
    })
  })

  it("follows D3.1's schedule when it changes", async () => {
    await lockTerms()
    await database.pool.query(
      "UPDATE tool_records SET payload = jsonb_set(payload, '{paymentSchedule}', payload->'paymentSchedule' || $1) WHERE tool_id = 'D3.1'",
      [JSON.stringify([{ milestone: "Retention", amountDue: 5000 }])]
    )

    const rows = rowsOf(await shown())

    expect(rows.map((row) => row.sn)).toEqual(["2.1", "2.2", "2.3", "2.4"])
    expect(rows[3]).toMatchObject({ milestone: "Retention" })
  })
})

describe("keeping it up to date", () => {
  it("saves only the expected dates by SN and the status, and keeps them through changes", async () => {
    await lockTerms()

    const start = await shown()

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.2",
      cycle: 1,
      values: {
        paymentSchedule: rowsOf(start).map((row) => ({
          sn: row.sn,
          ...(row.sn === "2.2" && { expectedTriggerDate: "2027-03-15" }),
          ...(row.sn === "2.1" && { expectedTriggerDate: "2027-01-02" }),
        })),
        financialStatus: "At Risk",
      },
    })

    expect(record.payload).toEqual({
      paymentSchedule: [
        { sn: "2.1", expectedTriggerDate: "2027-01-02" },
        { sn: "2.2", expectedTriggerDate: "2027-03-15" },
        { sn: "2.3" },
      ],
      financialStatus: "At Risk",
    })

    const again = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.2",
      cycle: 1,
      expectedUpdatedAt: record.updatedAt,
      values: {
        paymentSchedule: [
          { sn: "2.1", expectedTriggerDate: "2027-01-02" },
          { sn: "2.2", expectedTriggerDate: "2027-04-01" },
          { sn: "2.3" },
        ],
        financialStatus: "Healthy",
      },
    })

    expect(rowsOf(await shown(again.payload))[1]).toMatchObject({
      expectedTriggerDate: "2027-04-01",
    })
    expect(again.payload.financialStatus).toBe("Healthy")
  })

  it("is never submitted", async () => {
    await lockTerms()

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.2",
      cycle: 1,
      values: { financialStatus: "Healthy" },
    })

    await expect(submitRecord(database, fo, record.id)).rejects.toThrow(
      InvalidTransitionError
    )
  })

  it("lets the FO write it, the PM and CR read it, and no one else", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwame Asante", ["Client"])

    expect(await can(database, fo, projectId, "D3.2", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D3.2", "read")).toBe(true)
    expect(await can(database, pm, projectId, "D3.2", "write")).toBe(false)
    expect(await can(database, cr, projectId, "D3.2", "read")).toBe(true)
    expect(await can(database, cr, projectId, "D3.2", "write")).toBe(false)
    expect(await can(database, client, projectId, "D3.2", "read")).toBe(false)
  })
})
