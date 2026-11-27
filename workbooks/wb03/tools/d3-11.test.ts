import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  PROCEED as BANK_PROCEED,
  YES as FUNDS_YES,
} from "@/lib/bank-statement-log"
import { PROCEED } from "@/lib/billing-trigger"
import { addDays } from "@/lib/follow-dates"
import {
  daysLate,
  penaltyOf,
  percentIn,
  shownDays,
} from "@/lib/overdue-account"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { openOverdueReports } from "@/server/payments/overdue-account"
import { overdueValues } from "@/server/payments/overdue-figures"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { isWorkHalted } from "@/server/permissions/work-halted"
import {
  approveRecord,
  getRecord,
  saveDraft,
  signField,
  submitRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools, toolStatus } from "@/server/workflow/workflow"

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
import { d311 } from "./d3-11"

const database = createTestDatabase()

for (const tool of [d31, d32, d33, d34, d35, d36, d37, d38, d39, d310, d311]) {
  tools.registerTool(tool)
}

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
  wb04: ["D4.1"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

const PENALTY = "2% Monthly Interest on outstanding balance"

const today = () => new Date().toISOString().slice(0, 10)

// 2.2's invoice fell due 14 days ago.
const due = () => addDays(today(), -14)!

let projectId: string

let fo: string

let pm: string

let he: string

let le: string

let transport: FakeTransport

async function addProject() {
  const requestId = `Tier_1-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, 'Tier_1') RETURNING id",
    [requestId]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, 'Tier_1', $2, $3)",
    [requestId, rows[0]!.id, { organization_name: "Asante Mills" }]
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
  state = "locked"
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, $3, $4, $5, $6) RETURNING id",
    [
      projectId,
      toolId,
      state,
      payload,
      "2026-12-31T09:00:00Z",
      state === "locked" ? "2026-12-31T09:00:00Z" : null,
    ]
  )

  return rows[0]!.id
}

// Everything up to 2.2's sent invoice locked: a GHS 79,400.00 invoice due
// `dueDate`, and a bank check that found GHS 10,000.00 of it.
async function invoiceSent(dueDate = due()) {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
    await addRecord(toolId)
  }

  await addRecord("D3.1", {
    paymentSchedule: [
      { milestone: "Advance Payment (Contract Signing)", percentage: 40 },
      { milestone: "Fabrication Milestone (Design Approval)", percentage: 40 },
      { milestone: "Final Handover (System Delivery)", percentage: 20 },
    ],
    complianceRules: [
      { category: "Invoice Payment Window", term: "Net 21 Days" },
      { category: "Late Payment Penalty", term: PENALTY },
    ],
  })
  await addRecord("D3.3", {
    milestone: fabrication,
    actionTaken: PROCEED,
    clientAccepted: "Yes",
  })
  await addRecord("D3.4", {
    invoiceNumber: "IMHO-INV26-002",
    totalAmountDue: 79400,
  })
  await addRecord("D3.5", { authorized: "Yes" })
  await addRecord("D3.6", {
    sentTo: "billing@asantemills.test",
    dateSent: addDays(dueDate, -21)!,
    paymentDueDate: dueDate,
  })
  await addRecord("D3.7", {
    fundsDeposited: FUNDS_YES,
    amountDeposited: 10000,
    valueDate: addDays(dueDate, 2)!,
    actionRequired: BANK_PROCEED,
  })
}

async function open() {
  return openOverdueReports(database, { transport })
}

async function report() {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE tool_id = 'D3.11' AND project_id = $1",
    [projectId]
  )

  return rows.map((row) => row.id)
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.message)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

// The FO's save over the report the job opened, as the screen shows it.
async function save(values: JsonObject) {
  const { rows } = await database.pool.query<{ updated_at: Date }>(
    "SELECT updated_at FROM tool_records WHERE tool_id = 'D3.11' AND project_id = $1",
    [projectId]
  )

  return saveDraft(database, fo, {
    projectId,
    toolId: "D3.11",
    cycle: 1,
    values,
    expectedUpdatedAt: rows[0]!.updated_at,
  })
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])
  he = await addPerson("Kojo Mensah", ["HE"])
  le = await addPerson("Yaw Boateng", ["LE"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("the figures", () => {
  it("counts days late, reads the rate and charges a started month whole", () => {
    expect(daysLate("2027-01-14", "2027-01-28")).toBe(14)
    expect(daysLate("2027-01-14", "2027-01-10")).toBe(0)
    expect(shownDays(14)).toBe("14 Days")
    expect(shownDays(1)).toBe("1 Day")
    expect(percentIn(PENALTY)).toBe(2)
    expect(percentIn("0.5% Monthly Interest")).toBe(0.5)
    expect(percentIn(".5% Monthly Interest")).toBe(0.5)
    expect(percentIn("None agreed")).toBeUndefined()
    expect(penaltyOf(2, 69400, 14)).toBe(1388)
    expect(penaltyOf(2, 69400, 31)).toBe(2776)
    expect(penaltyOf(undefined, 69400, 14)).toBe(0)
  })
})

describe("opening", () => {
  it("is never open to a person: only the job opens it", async () => {
    await invoiceSent()

    expect(
      (await availableTools(database, projectId)).filter(
        (each) => each.toolId === "D3.11"
      )
    ).toEqual([])

    expect((await toolStatus(database, projectId, "D3.11")).note).toBe(
      "The app opens this tool the day after the milestone's invoice falls due unpaid."
    )
  })

  it("waits until the day after the due date", async () => {
    await invoiceSent(today())

    expect(await open()).toBe(0)
    expect(await report()).toEqual([])
  })

  it("opens one D3.11 for the late milestone, telling the FO and PM", async () => {
    await invoiceSent()

    expect(await open()).toBe(1)
    expect(await open()).toBe(0)
    expect(await report()).toHaveLength(1)

    for (const person of [fo, pm]) {
      const [told] = await listNotifications(database, person)

      expect(told?.title).toBe("D3.11 is open: payment overdue")
      expect(told?.path).toBe(`/projects/${projectId}/tools/D3.11?cycle=1`)
    }

    expect(await listNotifications(database, he)).toEqual([])
    expect(transport.sent.map((each) => each.to).sort()).toEqual(
      ["ama.owusu@imhogen.test", "esi.badu@imhogen.test"].sort()
    )
  })

  it("opens nothing for a milestone already paid", async () => {
    await invoiceSent()
    await addRecord("D3.8", { fundsAccounted: "Yes", actualCleared: 79400 })

    expect(await open()).toBe(0)
  })
})

describe("the report", () => {
  it("shows the due date, days, balance after deposits, penalty and PM", async () => {
    await invoiceSent()
    await open()

    const values = await overdueValues(
      database,
      projectId,
      { state: "draft", payload: {} },
      1
    )

    expect(values).toMatchObject({
      originalDueDate: due(),
      daysOverdue: "14 Days",
      outstandingBalance: 69400,
      penaltyRate: PENALTY,
      penaltyAccrued: 1388,
      assignedPm: "Ama Owusu",
    })
  })

  it("dates the revised invoice when Yes is saved, and clears it on No", async () => {
    await invoiceSent()
    await open()

    const yes = await save({ revisedInvoice: "Yes" })

    expect(yes.payload.revisedIssuedOn).toBe(today())

    const again = await save({ revisedInvoice: "Yes", escalated: "No" })

    expect(again.payload.revisedIssuedOn).toBe(today())

    const no = await save({ revisedInvoice: "No" })

    expect(no.payload.revisedIssuedOn).toBeUndefined()
  })

  it("keeps the fixed steps and takes an added row", async () => {
    await invoiceSent()
    await open()

    const saved = await save({
      escalationLog: [
        { action: "7-Day Courtesy Email Reminder (Before Due Date)" },
        {
          action: "Day 1 Overdue Notice (Formal Warning)",
          dateExecuted: addDays(due(), 1)!,
          notes: "No response",
        },
        { action: "Day 7 Overdue Phone Call" },
        { action: "Day 14 Overdue Work Stoppage Notice" },
        { action: "Site visit", notes: "Met the client's accountant" },
      ],
    })

    expect(saved.payload.escalationLog).toHaveLength(5)
    expect(saved.payload.escalationLog).toMatchObject([
      {},
      { notes: "No response" },
      {},
      {},
      { action: "Site visit" },
    ])
  })

  it("lets only the FO save it", async () => {
    await invoiceSent()
    await open()

    await expect(
      saveDraft(database, pm, {
        projectId,
        toolId: "D3.11",
        cycle: 1,
        values: { escalated: "No" },
      })
    ).rejects.toThrow(PermissionDeniedError)

    for (const person of [pm, he]) {
      expect(await can(database, person, projectId, "D3.11", "read")).toBe(true)
    }
  })

  it("refuses submit until both 4.0 questions are answered", async () => {
    await invoiceSent()
    await open()

    const draft = await save({ escalated: "Yes" })

    expect(await refusal(submitRecord(database, fo, draft.id))).toContain(
      "Answer whether engineering work must halt"
    )
  })
})

describe("signing and the halt", () => {
  async function signedWithHalt() {
    await invoiceSent()
    await open()

    const draft = await save({ escalated: "Yes", haltWork: "Yes" })

    await submitRecord(database, fo, draft.id, transport)

    return signField(database, pm, draft.id, "hofSignature", transport)
  }

  it("locks on the PM's signature, keeping the figures it showed", async () => {
    const locked = await signedWithHalt()

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      daysOverdue: "14 Days",
      outstandingBalance: 69400,
      penaltyAccrued: 1388,
    })

    const shown = await getRecord(database, fo, locked.id)

    expect(shown.payload.penaltyAccrued).toBe(1388)
  })

  it("halts later workbooks until the milestone's D3.8 is approved", async () => {
    expect(await can(database, le, projectId, "D4.1", "write")).toBe(true)

    await signedWithHalt()

    expect(await isWorkHalted(database, projectId)).toBe(true)
    expect(await can(database, le, projectId, "D4.1", "write")).toBe(false)
    expect(await can(database, pm, projectId, "D4.1", "approve")).toBe(false)
    expect(await can(database, le, projectId, "D4.1", "read")).toBe(true)
    expect(await can(database, fo, projectId, "D3.7", "write")).toBe(true)

    const [halted] = await listNotifications(database, he)

    expect(halted?.text).toContain("engineering work is halted")

    const reconciled = await addRecord(
      "D3.8",
      {
        fundsAccounted: "Yes",
        readyForReceipt: "Yes",
        foSignature: {
          signedBy: fo,
          signedAt: "2027-01-02T09:00:00.000Z",
        },
      },
      "submitted"
    )

    await approveRecord(database, pm, reconciled, transport)

    expect(await isWorkHalted(database, projectId)).toBe(false)
    expect(await can(database, le, projectId, "D4.1", "write")).toBe(true)

    const [resumed] = await listNotifications(database, le)

    expect(resumed?.text).toContain("engineering work may resume")
  })

  it("halts nothing when the halt is answered No", async () => {
    await invoiceSent()
    await open()

    const draft = await save({ escalated: "No", haltWork: "No" })

    await submitRecord(database, fo, draft.id, transport)
    await signField(database, pm, draft.id, "hofSignature", transport)

    expect(await isWorkHalted(database, projectId)).toBe(false)
    expect(await listNotifications(database, le)).toEqual([])
  })
})
