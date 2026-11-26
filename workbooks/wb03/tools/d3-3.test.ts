import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { PROCEED, REJECTED } from "@/lib/billing-trigger"
import {
  billingTriggerValues,
  milestoneValueOptions,
} from "@/server/payments/billing-trigger"
import { can } from "@/server/permissions/permissions"
import { cyclesOf } from "@/server/records/cycles"
import { firstFree, liveOptionsOf } from "@/server/records/options-from"
import {
  ValidationError,
  approveRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { getRecordScreen } from "@/server/records/screen"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools, toolStatus } from "@/server/workflow/workflow"

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

tools.registerTool(d31)

tools.registerTool(d33)

tools.registerTool(d34)

tools.registerTool(d35)

tools.registerTool(d36)

tools.registerTool(d37)

tools.registerTool(d38)

tools.registerTool(d39)

tools.registerTool(d310)

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

// WB01 and WB02 open their tools at once; WB03 runs its real order, with
// D3.3 once per payment milestone.
loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

const advance = "2.1 Advance Payment (Contract Signing)"

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

const handover = "2.3 Final Handover (System Delivery)"

const proof = "https://example.com/signed-design-approval.pdf"

let projectId: string

let pm: string

let fo: string

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

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z')",
    [projectId, toolId, payload]
  )
}

// D3.1 locked with three milestones, 40%, 40% and 20% of GHS 94,400.00,
// each Amount Due stored as D3.1's submit stores it.
async function lockTerms() {
  await addRecord("D1.16")
  await addRecord("D2.1", { executionPercentage: 40, currency: "GHS" })
  await addRecord("D2.2")
  await addRecord("D2.6")
  await addRecord("D2.12")
  await addRecord("D3.1", {
    paymentSchedule: [
      {
        milestone: "Advance Payment (Contract Signing)",
        percentage: 40,
        amountDue: 37760,
      },
      {
        milestone: "Fabrication Milestone (Design Approval)",
        percentage: 40,
        amountDue: 37760,
      },
      {
        milestone: "Final Handover (System Delivery)",
        percentage: 20,
        amountDue: 18880,
      },
    ],
  })
}

function trigger(values: JsonObject = {}): JsonObject {
  return {
    milestone: fabrication,
    proofOfCompletion: proof,
    clientAccepted: "Yes",
    openDisputes: "No",
    ...values,
  }
}

async function draft(cycle: number, values: JsonObject = trigger()) {
  return saveDraft(database, pm, { projectId, toolId: "D3.3", cycle, values })
}

async function signed(cycle: number, values?: JsonObject) {
  const record = await draft(cycle, values)

  await signField(database, pm, record.id, "pmSignature")

  return record
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.field)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

async function openD33() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.3"
  )
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  projectId = await addProject()
  pm = await addPerson("Ama Owusu", ["PM"])
  fo = await addPerson("Esi Badu", ["FO"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("opening", () => {
  it("waits for D3.1 to lock", async () => {
    await addRecord("D1.16")
    await addRecord("D2.12")

    expect(await openD33()).toEqual([])
  })

  it("opens cycle 1 once D3.1 locks, starting on the first milestone not billed", async () => {
    await lockTerms()

    expect(await openD33()).toEqual([{ toolId: "D3.3", cycle: 1 }])

    const live = await liveOptionsOf(database, projectId, "D3.3", null)

    expect(live.get("milestone")).toEqual({
      options: [advance, fabrication, handover],
      taken: [advance],
    })
    expect(firstFree(live)).toEqual({ milestone: fabrication })
  })

  it("shows each milestone's % and D3.1's amount, and the project's FO", async () => {
    await lockTerms()

    expect(
      await milestoneValueOptions(database, projectId, [fabrication, handover])
    ).toEqual({
      [fabrication]: "40% / GHS 37,760.00",
      [handover]: "20% / GHS 18,880.00",
    })

    const record = await draft(1)

    expect(
      await billingTriggerValues(database, projectId, {
        id: record.id,
        payload: record.payload,
      })
    ).toMatchObject({
      recipient: "Esi Badu",
      milestoneValue: "40% / GHS 37,760.00",
    })
  })
})

describe("submitting", () => {
  beforeEach(lockTerms)

  it("refuses without proof, without the client's acceptance, with a dispute open, or unsigned", async () => {
    const record = await draft(1, {
      milestone: fabrication,
      clientAccepted: "No",
      openDisputes: "Yes",
    })

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "proofOfCompletion",
      "pmSignature",
      "clientAccepted",
      "openDisputes",
    ])
  })

  it("refuses a milestone already billed", async () => {
    const record = await signed(1, trigger({ milestone: advance }))

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "milestone",
    ])
  })

  it("tells the FO, who sends it back as Rejected, then approves it as Proceed", async () => {
    const record = await signed(1)
    const submitted = await submitRecord(database, pm, record.id)
    const today = new Date().toISOString().slice(0, 10)

    expect(
      await billingTriggerValues(database, projectId, {
        id: submitted.id,
        payload: submitted.payload,
      })
    ).toMatchObject({
      triggerSentBy: "Ama Owusu",
      dateSent: today,
      dateReceived: today,
    })

    const { rows } = await database.pool.query<{ person_id: string }>(
      "SELECT person_id FROM notifications WHERE kind = 'approval_needed'"
    )

    expect(rows.map((row) => row.person_id)).toContain(fo)

    const back = await sendBackRecord(
      database,
      fo,
      record.id,
      "Attach the signed CAD sign-off"
    )

    expect(back.state).toBe("draft")
    expect(back.payload).toMatchObject({
      actionTaken: REJECTED,
      financeOfficer: "Esi Badu",
      dateReceived: today,
    })

    // The PM's changes keep the decision until it is submitted again.
    const changed = await updateRecord(database, pm, record.id, trigger())

    expect(changed.payload.actionTaken).toBe(REJECTED)

    await signField(database, pm, record.id, "pmSignature")

    const again = await submitRecord(database, pm, record.id)

    expect(again.payload).not.toHaveProperty("actionTaken")

    const locked = await approveRecord(database, fo, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      actionTaken: PROCEED,
      financeOfficer: "Esi Badu",
      dateReceived: today,
    })
  })
})

describe("the next milestone", () => {
  beforeEach(lockTerms)

  it("opens a new D3.3 once one is approved, until every milestone is, listing each by milestone", async () => {
    const first = await signed(1)

    await submitRecord(database, pm, first.id)

    // Only one milestone is triggered at a time.
    expect(await openD33()).toEqual([])

    await approveRecord(database, fo, first.id)

    expect(await openD33()).toEqual([{ toolId: "D3.3", cycle: 2 }])

    const live = await liveOptionsOf(database, projectId, "D3.3", null)

    expect(live.get("milestone")?.taken).toEqual([advance, fabrication])
    expect(firstFree(live)).toEqual({ milestone: handover })

    const screen = await getRecordScreen(database, pm, projectId, "D3.3")

    expect(screen.state).toBe("notStarted")
    expect(screen.cycle).toBe(2)
    expect(screen.cycles.map(({ label, state }) => [label, state])).toEqual([
      [fabrication, "locked"],
      ["Next milestone", "notStarted"],
    ])

    expect(
      (await getRecordScreen(database, fo, projectId, "D3.3", 1)).state
    ).toBe("locked")

    const second = await signed(2, trigger({ milestone: handover }))

    await submitRecord(database, pm, second.id)
    await approveRecord(database, fo, second.id)

    expect(await openD33()).toEqual([])

    const status = await toolStatus(database, projectId, "D3.3")

    expect(
      (await cyclesOf(database, projectId, "D3.3", status)).map(
        (each) => each.label
      )
    ).toEqual([fabrication, handover])
  })
})

describe("who sees it", () => {
  it("lets the PM write it, the FO approve it, the HE and CR read it, and nobody else see it", async () => {
    const he = await addPerson("Kojo Mensah", ["HE"])
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])
    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, pm, projectId, "D3.3", "write")).toBe(true)
    expect(await can(database, fo, projectId, "D3.3", "approve")).toBe(true)
    expect(await can(database, fo, projectId, "D3.3", "write")).toBe(false)

    for (const reader of [he, cr]) {
      expect(await can(database, reader, projectId, "D3.3", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.3", "write")).toBe(
        false
      )
    }

    for (const outsider of [client, om]) {
      expect(await can(database, outsider, projectId, "D3.3", "read")).toBe(
        false
      )
    }
  })

  it("refuses a decision kept in a field the form writes", () => {
    expect(() =>
      defineTool({
        id: "X1",
        name: "Bad",
        workbook: "wb03",
        decision: { field: "action", approve: "Go", sendBack: "Stop" },
        fields: [
          {
            key: "action",
            label: "Action",
            type: "select",
            options: ["Go", "Stop"],
          },
        ],
      })
    ).toThrow("not a system-filled select")
  })
})
