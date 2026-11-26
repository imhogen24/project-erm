import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { PROCEED as BANK_PROCEED } from "@/lib/bank-statement-log"
import { PROCEED } from "@/lib/billing-trigger"
import { nextPhaseOf } from "@/lib/unblock-notice"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { unblockStart, unblockValues } from "@/server/payments/unblock-notice"
import { can } from "@/server/permissions/permissions"
import {
  getRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d31 } from "./d3-1"
import { d33 } from "./d3-3"
import { d34 } from "./d3-4"
import { d35 } from "./d3-5"
import { d36 } from "./d3-6"
import { d37 } from "./d3-7"
import { d38 } from "./d3-8"
import { d39 } from "./d3-9"
import { d310 } from "./d3-10"

const database = createTestDatabase()

for (const tool of [d31, d33, d34, d35, d36, d37, d38, d39, d310]) {
  tools.registerTool(tool)
}

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

const handover = "2.3 Final Handover (System Delivery)"

const NEXT_PHASE = "Phase 3: Final Handover (System Delivery)"

let projectId: string

let fo: string

let pm: string

let he: string

let transport: FakeTransport

async function addProject(name = "Rice Mill") {
  const requestId = `Tier_1-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, requestId]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, 'Tier_1', $2, $3)",
    [requestId, rows[0]!.id, { organization_name: "Asante Mills" }]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: Role[], on = projectId) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@imhogen.test`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, on, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(
  toolId: string,
  payload: JsonObject = {},
  on = projectId
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [on, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

// Everything before D3.10 for one milestone locked: D3.1's three
// milestones, the trigger for `milestone`, the invoice, the bank check,
// D3.8 with `cleared` clearing in the bank, and D3.9's receipt sent.
async function reconcile(
  cleared = 43424,
  on = projectId,
  milestone = fabrication
) {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
    await addRecord(toolId, {}, on)
  }

  await addRecord(
    "D3.1",
    {
      paymentSchedule: [
        { milestone: "Advance Payment (Contract Signing)", percentage: 40 },
        {
          milestone: "Fabrication Milestone (Design Approval)",
          percentage: 40,
        },
        { milestone: "Final Handover (System Delivery)", percentage: 20 },
      ],
    },
    on
  )
  await addRecord(
    "D3.3",
    { milestone, actionTaken: PROCEED, clientAccepted: "Yes" },
    on
  )
  await addRecord("D3.4", { invoiceNumber: "IMHO-INV26-001" }, on)
  await addRecord("D3.5", { authorized: "Yes" }, on)
  await addRecord("D3.6", { sentTo: "billing@asantemills.test" }, on)
  await addRecord("D3.7", { actionRequired: BANK_PROCEED }, on)
  await addRecord("D3.8", { fundsAccounted: "Yes", actualCleared: cleared }, on)
  await addRecord("D3.9", { receiptNumber: "IMHO-REC26-001" }, on)
}

async function openD310() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.10"
  )
}

const tracking = (status: string) => ({
  task: 'Has the central tracking database been updated to "Active Engineering Phase"?',
  assignee: "Finance Officer",
  status,
})

const acknowledged = () => ({
  task: "Has the Project Manager formally acknowledged receipt of this Unblock Notice?",
  assignee: "Project Manager",
  status: "Pending",
})

// The FO's D3.10 for 2.2, from the starting values, ready to submit unless
// `values` change it.
async function draft(values: JsonObject = {}) {
  const start = await unblockStart(database, projectId, 1)

  return saveDraft(database, fo, {
    projectId,
    toolId: "D3.10",
    cycle: 1,
    values: {
      ...start,
      financialHolds: "No",
      routingTasks: [tracking("Done"), acknowledged()],
      authorized: "Yes",
      ...values,
    },
  })
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

const today = () => new Date().toISOString().slice(0, 10)

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
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("the next phase", () => {
  it("names the D3.1 milestone after the one billed by its place, or nothing after the last", () => {
    const schedule = [
      { milestone: "Advance" },
      { milestone: "Design Approval" },
      { milestone: "Prototype Fabrication" },
    ]

    expect(nextPhaseOf(schedule, 1)).toBe("Phase 3: Prototype Fabrication")
    expect(nextPhaseOf(schedule, 2)).toBe("")
    expect(nextPhaseOf(schedule, -1)).toBe("")
  })
})

describe("opening", () => {
  it("opens a cycle's D3.10 once its D3.9 is sent", async () => {
    await reconcile()

    expect(await openD310()).toEqual([{ toolId: "D3.10", cycle: 1 }])

    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE tool_id = 'D3.9'"
    )

    expect(await openD310()).toEqual([])
  })
})

describe("starting values", () => {
  it("starts 3.0 on the next milestone, and empty on the last", async () => {
    await reconcile()

    expect(await unblockStart(database, projectId, 1)).toEqual({
      phaseAuthorized: NEXT_PHASE,
    })

    const last = await addProject("Boiler")

    await reconcile(43424, last, handover)

    expect(await unblockStart(database, last, 1)).toEqual({})
  })

  it("shows the metadata and D3.8's amount cleared", async () => {
    await reconcile(43409)

    expect(await unblockValues(database, projectId, null, 1)).toMatchObject({
      requestId: expect.stringMatching(/^Tier_1-/),
      assignedPm: "Ama Owusu",
      issuingFo: "Esi Badu",
      amountSecured: 43409,
    })
  })
})

describe("submitting", () => {
  it("is refused while holds remain, a routing task is Pending, or engineering is not authorized", async () => {
    await reconcile()

    const held = await draft({ financialHolds: "Yes" })

    expect(await refusal(submitRecord(database, fo, held.id))).toEqual([
      "The next phase stays locked while financial holds remain",
    ])

    await updateRecord(database, fo, held.id, {
      ...held.payload,
      financialHolds: "No",
      routingTasks: [
        tracking("Done"),
        acknowledged(),
        { task: "Brief the site team", assignee: "HE", status: "Pending" },
      ],
      authorized: "No",
    })

    expect(await refusal(submitRecord(database, fo, held.id))).toEqual([
      "Mark every routing task Done before submitting",
      "Answer Yes once engineering may resume billable work",
    ])
  })

  it("submits with an added row Done, leaving the PM's row to the signature, and fills in the notice date", async () => {
    await reconcile()

    const record = await draft({
      routingTasks: [
        tracking("Done"),
        acknowledged(),
        { task: "Brief the site team", assignee: "HE", status: "Done" },
      ],
    })

    const submitted = await submitRecord(database, fo, record.id)

    expect(submitted.state).toBe("submitted")
    expect(
      (await unblockValues(database, projectId, submitted, 1)).noticeDate
    ).toBe(today())
  })
})

describe("signing", () => {
  it("approves and locks it as the PM signs, marks the PM's row Done and tells the FO and HE", async () => {
    await reconcile()

    const record = await draft()

    await submitRecord(database, fo, record.id)
    await signField(database, pm, record.id, "hofSignature", transport)

    const locked = await getRecord(database, pm, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload.routingTasks).toMatchObject([
      { status: "Done" },
      { status: "Done" },
    ])
    expect(
      (await unblockValues(database, projectId, locked, 1)).signedDate
    ).toBe(today())

    for (const person of [fo, he]) {
      const told = (await listNotifications(database, person)).filter(
        (each) => each.kind === "lock_announced"
      )

      expect(told).toMatchObject([
        {
          title: "D3.10 is approved",
          text: `Phase Unblock Notice on Rice Mill: ${NEXT_PHASE} may start`,
        },
      ])
    }

    expect(transport.sent.map((email) => email.to).sort()).toEqual([
      "esi.badu@imhogen.test",
      "kojo.mensah@imhogen.test",
    ])
  })

  it("goes back to the FO when the PM sends it back, to change and submit again", async () => {
    await reconcile()

    const record = await draft()

    await submitRecord(database, fo, record.id)
    await sendBackRecord(database, pm, record.id, "Name the phase in full")

    const back = await getRecord(database, fo, record.id)

    expect(back.state).toBe("draft")

    await updateRecord(database, fo, record.id, {
      ...back.payload,
      phaseAuthorized: `${NEXT_PHASE} and commissioning`,
    })

    expect((await submitRecord(database, fo, record.id)).state).toBe(
      "submitted"
    )
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM approve it, the HE and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.10", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D3.10", "approve")).toBe(true)
    expect(await can(database, pm, projectId, "D3.10", "write")).toBe(false)

    for (const reader of [he, cr]) {
      expect(await can(database, reader, projectId, "D3.10", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.10", "write")).toBe(
        false
      )
    }

    expect(await can(database, client, projectId, "D3.10", "read")).toBe(false)
  })
})
