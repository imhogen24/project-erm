import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  CONTINUE_WAITING,
  NO,
  PROCEED,
  YES,
  accountChecked,
  bankLogCells,
  isWorkingDay,
  varianceOf,
} from "@/lib/bank-statement-log"
import { PROCEED as TRIGGER_PROCEED } from "@/lib/billing-trigger"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import {
  bankLogFills,
  bankLogValues,
  sendBankCheckReminders,
} from "@/server/payments/bank-statement-log"
import { can } from "@/server/permissions/permissions"
import {
  getRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { defineTool } from "@/server/tools/define-tool"
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

const database = createTestDatabase()

for (const tool of [d31, d33, d34, d35, d36, d37]) {
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

// D3.6 was sent on Tuesday 17 November 2026; the 18th is a Wednesday.
const NEXT_MORNING = new Date("2026-11-18T09:30:00Z")

const TOTAL = 43424

let projectId: string

let fo: string

let pm: string

let transport: FakeTransport

async function addProject(name = "Rice Mill") {
  const requestId = `Tier_1-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, requestId]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, 'Tier_1', $2, $3)",
    [
      requestId,
      rows[0]!.id,
      {
        organization_name: "Asante Mills",
        contact_person: "Kwame Asante",
        email: "accounts@asantemills.test",
      },
    ]
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

async function addRecord(toolId: string, payload: JsonObject = {}, cycle = 1) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, $3, 'locked', $4, $5, $5) RETURNING id",
    [projectId, toolId, cycle, payload, "2026-11-17T09:00:00Z"]
  )

  return rows[0]!.id
}

// D3.1 locked with three milestones, and 2.2's invoice of GHS 43,424.00
// approved and sent (D3.3 to D3.6 locked).
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
  await addRecord("D3.6", { dateSent: "2026-11-17" })
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

// The FO's check for 2.2, signed and submitted.
async function check(values: JsonObject) {
  const record = await saveDraft(database, fo, {
    projectId,
    toolId: "D3.7",
    cycle: 1,
    values,
  })

  await signField(database, fo, record.id, "foSignature")

  return submitRecord(database, fo, record.id)
}

const noFunds = { fundsDeposited: NO, actionRequired: CONTINUE_WAITING }

const paid = (deposited: number, matches = YES) => ({
  fundsDeposited: YES,
  amountDeposited: deposited,
  reference: "TRF FROM ASANTE MILLS - INV001",
  valueDate: "2026-11-18",
  amountMatches: matches,
  actionRequired: PROCEED,
})

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  transport = createFakeTransport()
  projectId = await addProject()
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("the variance", () => {
  it("is the deposit less the invoice's total, only once funds came in", () => {
    const shortBy15 = {
      fundsDeposited: YES,
      amountDeposited: TOTAL - 15,
      expectedAmount: TOTAL,
    }

    expect(varianceOf(shortBy15)).toBe(-15)
    expect(bankLogCells(shortBy15)).toEqual({ variance: "GHS -15.00" })
    expect(varianceOf({ ...shortBy15, fundsDeposited: NO })).toBeUndefined()
    expect(varianceOf({ fundsDeposited: YES, expectedAmount: 1 })).toBe(
      undefined
    )
  })

  it("counts Monday to Friday as working days", () => {
    expect(isWorkingDay("2026-11-18")).toBe(true)
    expect(isWorkingDay("2026-11-21")).toBe(false)
    expect(isWorkingDay("2026-11-22")).toBe(false)
  })
})

describe("the definition", () => {
  const base = {
    id: "X9.1",
    name: "Repeating",
    workbook: "wb03",
    fields: [
      {
        key: "next",
        label: "Next",
        type: "select" as const,
        options: ["Again", "Stop"],
      },
      {
        key: "kept",
        label: "Kept",
        type: "table" as const,
        readOnly: true,
        columns: [{ key: "next", label: "Next", type: "text" as const }],
      },
    ],
  }

  it("repeats on a select's option into a read-only table of its fields, locking on submit", () => {
    expect(() =>
      defineTool({
        ...base,
        locksOnSubmit: true,
        repeatsWhile: { field: "next", is: "Again", keepsIn: "kept" },
      })
    ).not.toThrow()

    expect(() =>
      defineTool({
        ...base,
        repeatsWhile: { field: "next", is: "Again", keepsIn: "kept" },
      })
    ).toThrow(/locks on submit/)

    expect(() =>
      defineTool({
        ...base,
        locksOnSubmit: true,
        repeatsWhile: { field: "next", is: "Never", keepsIn: "kept" },
      })
    ).toThrow(/not a select with the option/)

    expect(() =>
      defineTool({
        ...base,
        locksOnSubmit: true,
        repeatsWhile: { field: "next", is: "Again", keepsIn: "next" },
      })
    ).toThrow(/not a read-only table/)
  })

  it("ties a select's option only to a number field", () => {
    expect(() =>
      defineTool({
        ...base,
        submitWhen: [
          {
            field: "next",
            is: "Stop",
            matches: { field: "next", equals: 0 },
            message: "No",
          },
        ],
      })
    ).toThrow(/not a number field/)
  })
})

describe("opening", () => {
  it("opens a cycle's D3.7 once that cycle's D3.6 is sent", async () => {
    const open = async () =>
      (await availableTools(database, projectId)).filter(
        (each) => each.toolId === "D3.7"
      )

    await sendInvoice()

    expect(await open()).toEqual([{ toolId: "D3.7", cycle: 1 }])

    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE tool_id = 'D3.6'"
    )

    expect(await open()).toEqual([])
  })
})

describe("what the system fills in", () => {
  it("shows the account, the invoice's total and the client's name", async () => {
    await sendInvoice()

    expect(
      await bankLogValues(
        database,
        projectId,
        { state: "notStarted", payload: {} },
        1
      )
    ).toEqual({
      requestId: expect.stringMatching(/^Tier_1-/),
      accountChecked: accountChecked(),
      expectedAmount: TOTAL,
    })

    expect(accountChecked("Fidelity Bank")).toBe("IMHOGEN Fidelity Bank")

    expect(await bankLogFills(database, projectId)).toEqual({
      "Client Name": "Asante Mills",
    })
  })
})

describe("checking each day", () => {
  it("keeps a Continue waiting check and opens the next one, empty, at once", async () => {
    await sendInvoice()

    const next = await check(noFunds)

    expect(next.state).toBe("draft")
    expect(next.payload).toEqual({
      earlierChecks: [
        {
          checkingOfficer: "Esi Badu",
          dateOfCheck: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          timeOfCheck: expect.stringMatching(/^\d{2}:\d{2}$/),
          fundsDeposited: NO,
          actionRequired: CONTINUE_WAITING,
        },
      ],
    })

    await updateRecord(database, fo, next.id, {
      ...noFunds,
      earlierChecks: next.payload.earlierChecks!,
    })
    await signField(database, fo, next.id, "foSignature")

    const third = await submitRecord(database, fo, next.id)
    const before = next.payload.earlierChecks

    expect(third.state).toBe("draft")
    expect(third.payload.earlierChecks).toEqual([
      expect.objectContaining({ actionRequired: CONTINUE_WAITING }),
      ...(Array.isArray(before) ? before : []),
    ])
    expect((await getRecord(database, fo, next.id)).state).toBe("draft")
  })

  it("refuses 3.0 Yes while the deposit is 15.00 short, and takes No", async () => {
    await sendInvoice()

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.7",
      cycle: 1,
      values: paid(TOTAL - 15),
    })

    await signField(database, fo, record.id, "foSignature")

    expect(await refusal(submitRecord(database, fo, record.id))).toEqual([
      "amountMatches",
    ])

    expect((await getRecord(database, fo, record.id)).state).toBe("draft")

    await updateRecord(database, fo, record.id, paid(TOTAL - 15, NO))
    await signField(database, fo, record.id, "foSignature")

    const locked = await submitRecord(database, fo, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload.variance).toBe(-15)
  })

  it("refuses Proceed with no funds, and asks for the payment's details with funds", async () => {
    await sendInvoice()

    expect(
      await refusal(check({ fundsDeposited: NO, actionRequired: PROCEED }))
    ).toEqual(["actionRequired"])

    await resetTestData(database)
    await restoreSystemPerson(database)
    projectId = await addProject()
    fo = await addPerson("Esi Badu", ["FO"])
    await sendInvoice()

    expect(
      await refusal(check({ fundsDeposited: YES, actionRequired: PROCEED }))
    ).toEqual(["amountDeposited", "reference", "valueDate", "amountMatches"])
  })

  it("locks for good on Proceed with the exact amount", async () => {
    await sendInvoice()

    const locked = await check(paid(TOTAL))

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      checkingOfficer: "Esi Badu",
      accountChecked: accountChecked(),
      expectedAmount: TOTAL,
      variance: 0,
      actionRequired: PROCEED,
    })
    expect(locked.payload.earlierChecks).toBeUndefined()
  })
})

describe("the daily reminder", () => {
  async function titles() {
    return (await listNotifications(database, fo)).map((each) => each.title)
  }

  it("reminds the FO once each working morning after the invoice went", async () => {
    await sendInvoice()

    expect(
      await sendBankCheckReminders(database, {
        transport,
        now: new Date("2026-11-17T10:00:00Z"),
      })
    ).toBe(0)

    expect(
      await sendBankCheckReminders(database, {
        transport,
        now: new Date("2026-11-18T08:59:00Z"),
      })
    ).toBe(0)

    expect(
      await sendBankCheckReminders(database, { transport, now: NEXT_MORNING })
    ).toBe(1)

    expect(
      await sendBankCheckReminders(database, {
        transport,
        now: new Date("2026-11-18T11:00:00Z"),
      })
    ).toBe(0)

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]!.to).toBe("esi.badu@imhogen.test")
    expect(transport.sent[0]!.text).toContain(fabrication)
    expect(transport.sent[0]!.text).toContain("tools/D3.7?cycle=1")
    expect(await titles()).toEqual(["Check the bank for the milestone payment"])

    expect(
      await sendBankCheckReminders(database, {
        transport,
        now: new Date("2026-11-21T09:30:00Z"),
      })
    ).toBe(0)
  })

  it("stops once the FO proceeds", async () => {
    await sendInvoice()
    await check(paid(TOTAL))

    expect(
      await sendBankCheckReminders(database, {
        transport,
        now: new Date("2026-11-19T09:30:00Z"),
      })
    ).toBe(0)
    expect(await titles()).toEqual([])
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const he = await addPerson("Kojo Mensah", ["HE"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.7", "write")).toBe(true)

    for (const reader of [pm, cr]) {
      expect(await can(database, reader, projectId, "D3.7", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.7", "write")).toBe(
        false
      )
    }

    for (const outsider of [he, client]) {
      expect(await can(database, outsider, projectId, "D3.7", "read")).toBe(
        false
      )
    }
  })
})
