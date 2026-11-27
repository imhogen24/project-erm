import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  CONTINUE_WAITING,
  NO as FUNDS_NO,
  PROCEED,
  YES as FUNDS_YES,
} from "@/lib/bank-statement-log"
import { PROCEED as TRIGGER_PROCEED } from "@/lib/billing-trigger"
import { DONE, NO, YES, clearedOf, matchingOf } from "@/lib/reconciled-payment"
import { createFakeTransport } from "@/server/email/email"
import { reconciledValues } from "@/server/payments/reconciled-payment"
import { isCyclePaid } from "@/server/payments/reconciled-submit"
import { sendInvoiceReminders } from "@/server/payments/transmitted-invoice"
import { can } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  approveRecord,
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
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

const TOTAL = 43424

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

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [projectId, toolId, payload, "2026-11-17T09:00:00Z"]
  )
}

// 2.2's invoice of GHS 43,424.00 approved and sent (D3.1 to D3.6 locked).
async function sendInvoice() {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
    await addRecord(toolId)
  }

  await addRecord("D3.1", {
    paymentSchedule: [
      { milestone: "Advance Payment (Contract Signing)", percentage: 40 },
      { milestone: "Fabrication Milestone (Design Approval)", percentage: 40 },
      { milestone: "Final Handover (System Delivery)", percentage: 20 },
    ],
    complianceRules: [{ term: "Net 21 Days from Invoice Issuance" }],
  })

  await addRecord("D3.3", {
    milestone: fabrication,
    actionTaken: TRIGGER_PROCEED,
    clientAccepted: "Yes",
  })

  await addRecord("D3.4", {
    invoiceNumber: "IMHO-INV26-001",
    totalAmountDue: TOTAL,
  })

  await addRecord("D3.5", { authorized: "Yes" })
  await addRecord("D3.6", {
    dateSent: "2026-11-17",
    paymentDueDate: "2026-12-08",
    reminderScheduled: "Yes",
    sentTo: "accounts@asantemills.test",
  })
}

// The FO's next bank check for 2.2, signed and submitted: the open check
// when there is one, keeping its earlier checks.
async function check(values: JsonObject) {
  const { rows } = await database.pool.query<{
    id: string
    payload: JsonObject
  }>("SELECT id, payload FROM tool_records WHERE tool_id = 'D3.7'")

  const open = rows[0]

  const record = open
    ? await updateRecord(database, fo, open.id, {
        ...values,
        ...(open.payload.earlierChecks !== undefined && {
          earlierChecks: open.payload.earlierChecks,
        }),
      })
    : await saveDraft(database, fo, {
        projectId,
        toolId: "D3.7",
        cycle: 1,
        values,
      })

  await signField(database, fo, record.id, "foSignature")

  return submitRecord(database, fo, record.id)
}

const deposit = (amount: number, day = "2026-11-18") => ({
  fundsDeposited: FUNDS_YES,
  amountDeposited: amount,
  reference: "TRF FROM ASANTE MILLS - INV001",
  valueDate: day,
  amountMatches: amount === TOTAL ? FUNDS_YES : FUNDS_NO,
  actionRequired: PROCEED,
})

// The FO's D3.8 for 2.2, saved with `values` and signed.
async function reconcile(values: JsonObject) {
  const record = await saveDraft(database, fo, {
    projectId,
    toolId: "D3.8",
    cycle: 1,
    values,
  })

  await signField(database, fo, record.id, "foSignature")

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

const opened = async () =>
  (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.8"
  )

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  projectId = await addProject()
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("the sums", () => {
  it("adds up every deposit and takes the latest value date", () => {
    const checks: JsonObject[] = [
      {
        fundsDeposited: FUNDS_YES,
        amountDeposited: 100.1,
        valueDate: "2026-11-20",
      },
      { fundsDeposited: FUNDS_NO },
      {
        fundsDeposited: FUNDS_YES,
        amountDeposited: 200.2,
        valueDate: "2026-11-18",
      },
    ]

    expect(clearedOf(checks)).toEqual({ amount: 300.3, date: "2026-11-20" })
    expect(clearedOf([{ fundsDeposited: FUNDS_NO }])).toBeUndefined()
    expect(matchingOf(315.3, checks)).toEqual({
      expectedAmount: 315.3,
      actualCleared: 300.3,
      dateCleared: "2026-11-20",
      variance: -15,
    })
  })
})

describe("opening", () => {
  it("opens a cycle's D3.8 once its D3.7 is submitted with Proceed", async () => {
    await sendInvoice()

    await check({ fundsDeposited: FUNDS_NO, actionRequired: CONTINUE_WAITING })
    expect(await opened()).toEqual([])

    await check(deposit(TOTAL))
    expect(await opened()).toEqual([{ toolId: "D3.8", cycle: 1 }])
  })

  it("shows the invoice's total, what cleared, the day and the variance", async () => {
    await sendInvoice()
    await check(deposit(TOTAL - 15, "2026-11-19"))

    expect(
      await reconciledValues(
        database,
        projectId,
        { state: "notStarted", payload: {} },
        1
      )
    ).toMatchObject({
      expectedAmount: TOTAL,
      actualCleared: TOTAL - 15,
      dateCleared: "2026-11-19",
      variance: -15,
    })
  })
})

describe("submitting", () => {
  it("refuses answers that disagree, and a submit without the FO's signature", async () => {
    await sendInvoice()
    await check(deposit(TOTAL))

    const disagree = await reconcile({
      fundsAccounted: YES,
      readyForReceipt: NO,
    })

    expect(await refusal(submitRecord(database, fo, disagree.id))).toEqual([
      "fundsAccounted",
    ])

    // Editing the answers clears the signature.
    const unsigned = await updateRecord(database, fo, disagree.id, {
      fundsAccounted: YES,
      readyForReceipt: YES,
    })

    expect(await refusal(submitRecord(database, fo, unsigned.id))).toEqual([
      "foSignature",
    ])
  })
})

describe("a bank-fee gap the PM approves", () => {
  it("locks it, sets 3.0 Done, marks the invoice paid and stops the D3.6 reminder", async () => {
    await sendInvoice()
    await check(deposit(TOTAL - 15))

    const record = await reconcile({
      fundsAccounted: YES,
      readyForReceipt: YES,
    })

    await submitRecord(database, fo, record.id)

    const submitted = await getRecord(database, pm, record.id)

    expect(submitted.payload).toMatchObject({
      actualCleared: TOTAL - 15,
      variance: -15,
    })

    expect(
      await reconciledValues(
        database,
        projectId,
        { id: record.id, state: "submitted", payload: submitted.payload },
        1
      )
    ).toMatchObject({ reconcilingOfficer: "Esi Badu" })

    expect(await isCyclePaid(database, projectId, 1)).toBe(false)

    await approveRecord(database, pm, record.id)

    const locked = await getRecord(database, pm, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload.accounting).toMatchObject([
      { status: DONE },
      { status: DONE },
    ])
    expect(await isCyclePaid(database, projectId, 1)).toBe(true)

    expect(
      await sendInvoiceReminders(database, {
        transport: createFakeTransport(),
        now: new Date("2026-12-01T09:00:00Z"),
      })
    ).toBe(0)
  })
})

describe("a shortfall", () => {
  it("cannot be approved; sending it back reopens D3.7 as a new check, and the next D3.8 adds both deposits", async () => {
    await sendInvoice()
    await check(deposit(TOTAL / 2))

    const record = await reconcile({ fundsAccounted: NO, readyForReceipt: NO })

    await submitRecord(database, fo, record.id)

    await expect(approveRecord(database, pm, record.id)).rejects.toThrow(
      InvalidTransitionError
    )

    await sendBackRecord(database, pm, record.id, "Half the money is in")

    expect((await getRecord(database, pm, record.id)).state).toBe("locked")
    expect(await isCyclePaid(database, projectId, 1)).toBe(false)

    const [log] = (
      await database.pool.query<{ state: string; payload: JsonObject }>(
        "SELECT state, payload FROM tool_records WHERE tool_id = 'D3.7'"
      )
    ).rows

    expect(log!.state).toBe("draft")
    expect(log!.payload.fundsDeposited).toBeUndefined()
    expect(log!.payload.earlierChecks).toMatchObject([
      { amountDeposited: TOTAL / 2 },
    ])

    await check(deposit(TOTAL / 2, "2026-11-24"))

    const again = await getRecord(database, fo, record.id)

    expect(again.state).toBe("draft")

    expect(
      await reconciledValues(
        database,
        projectId,
        { id: record.id, state: "draft", payload: again.payload },
        1
      )
    ).toMatchObject({
      actualCleared: TOTAL,
      dateCleared: "2026-11-24",
      variance: 0,
    })
  })

  it("lets the PM send a Yes back to the FO as a draft", async () => {
    await sendInvoice()
    await check(deposit(TOTAL))

    const record = await reconcile({
      fundsAccounted: YES,
      readyForReceipt: YES,
    })

    await submitRecord(database, fo, record.id)
    await sendBackRecord(database, pm, record.id, "Check the reference")

    expect((await getRecord(database, fo, record.id)).state).toBe("draft")
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM approve it, the HE and CR read it, and nobody else see it", async () => {
    const he = await addPerson("Kojo Mensah", ["HE"])
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.8", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D3.8", "approve")).toBe(true)
    expect(await can(database, pm, projectId, "D3.8", "write")).toBe(false)

    for (const reader of [he, cr]) {
      expect(await can(database, reader, projectId, "D3.8", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.8", "write")).toBe(
        false
      )
    }

    expect(await can(database, client, projectId, "D3.8", "read")).toBe(false)
  })
})
