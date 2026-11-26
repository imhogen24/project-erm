import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  DONE,
  FAIL,
  NO,
  PASS,
  PENDING,
  YES,
  conversionTasks,
  invoiceFileName,
  invoicePath,
  qualityChecks,
} from "@/lib/approved-invoice"
import { PROCEED } from "@/lib/billing-trigger"
import { listNotifications } from "@/server/notifications/notifications"
import {
  InvoiceNotFoundError,
  approvedInvoice,
  approvedInvoiceFills,
  approvedInvoiceValues,
  shownInvoice,
} from "@/server/payments/approved-invoice"
import { invoicePdf } from "@/server/pdf/invoice-pdf"
import { previewStates } from "@/server/pdf/previews"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { cyclesOf } from "@/server/records/cycles"
import {
  ValidationError,
  getRecord,
  saveDraft,
  sentBackReason,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { systemValuesOf } from "@/server/records/system-values"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools, toolStatus } from "@/server/workflow/workflow"

import { d31 } from "./d3-1"
import { d33 } from "./d3-3"
import { d34 } from "./d3-4"
import { d35 } from "./d3-5"
import { d36 } from "./d3-6"

const database = createTestDatabase()

tools.registerTool(d31)

tools.registerTool(d33)

tools.registerTool(d34)

tools.registerTool(d35)

tools.registerTool(d36)

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

const submitted = "2026-11-18T06:00:00Z"

const locked = "2026-11-18T09:00:00Z"

let projectId: string

let fo: string

let pm: string

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
        site_location: "Tema Industrial Area, Accra",
      },
    ]
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
  cycle = 1,
  on = projectId
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, $3, 'locked', $4, $5, $6) RETURNING id",
    [on, toolId, cycle, payload, submitted, locked]
  )

  return rows[0]!.id
}

// D3.1 locked with three milestones, 40%, 40% and 20% of GHS 94,400.00,
// and the sheet's four terms.
async function lockTerms(on = projectId) {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
    await addRecord(toolId, {}, 1, on)
  }

  await addRecord(
    "D3.1",
    {
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
      complianceRules: [
        { term: "Net 21 Days from Invoice Issuance" },
        { term: "2% Monthly Interest on outstanding balance" },
        { term: "All prices are exclusive of 15% VAT" },
        { term: "Ghana Cedis (GHS) ONLY" },
      ],
    },
    1,
    on
  )
}

// The cycle's D3.3 approved by the FO, for the milestone picked.
async function approveTrigger(
  cycle: number,
  milestone: string,
  on = projectId
) {
  await addRecord(
    "D3.3",
    { milestone, actionTaken: PROCEED, clientAccepted: "Yes" },
    cycle,
    on
  )
}

const line = {
  description: "Fabrication Milestone (Design Approval) (40% Milestone)",
  quantity: 1,
  unitPrice: 37760,
  totalAmount: 37760,
}

function invoice(values: JsonObject = {}): JsonObject {
  return {
    invoiceNumber: "IMHO-INV26-001",
    billingAddress: "Asante Mills\nTema Industrial Area, Accra",
    lineItems: [line, {}],
    subtotal: 37760,
    vat: 5664,
    totalAmountDue: 43424,
    draftComplete: "Yes",
    ...values,
  }
}

// The cycle's D3.4 locked by the FO, for the milestone picked.
async function lockInvoice(
  cycle = 1,
  milestone = fabrication,
  values = invoice()
) {
  await approveTrigger(cycle, milestone)

  const record = await addRecord("D3.4", values, cycle)

  await database.pool.query(
    "UPDATE tool_records SET submitted_by = $1 WHERE id = $2",
    [fo, record]
  )

  return record
}

// D3.5's 2.0 as the sheet lists it, every check Pass, or the checks picked
// failed with a comment.
function checks(
  failed: number[] = [],
  comment = "VAT should be 15% of the subtotal"
) {
  return qualityChecks.map((check, index) => ({
    ...check,
    status: failed.includes(index) ? FAIL : PASS,
    ...(failed.includes(index) && { comments: comment }),
  }))
}

function approval(values: JsonObject = {}): JsonObject {
  return {
    checklist: checks(),
    conversion: conversionTasks.map((task) => ({ ...task, status: PENDING })),
    authorized: YES,
    ...values,
  }
}

async function draft(values: JsonObject = approval(), cycle = 1) {
  return saveDraft(database, pm, { projectId, toolId: "D3.5", cycle, values })
}

async function signed(values: JsonObject = approval(), cycle = 1) {
  const record = await draft(values, cycle)

  await signField(database, pm, record.id, "pmSignature")

  return record
}

// A full first cycle, its D3.4 locked and D3.5 open.
async function openApproval() {
  await lockTerms()

  return await lockInvoice()
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

async function openD35() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.5"
  )
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
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

describe("the invoice file", () => {
  it("names it after the invoice and the client, and links it to its cycle", () => {
    expect(invoiceFileName("IMHO-INV26-002", "Acme Foods Ltd")).toBe(
      "IMHO_INV26_002_AcmeFoodsLtd.pdf"
    )
    expect(invoiceFileName("", "Acme Foods")).toBe("IMHO_INV_AcmeFoods.pdf")
    expect(invoiceFileName("IMHO-INV26-002", "")).toBe(
      "IMHO_INV26_002_Client.pdf"
    )

    expect(invoicePath("project", 2)).toBe("/api/projects/project/invoices/2")
    expect(invoicePath("project", 2, true)).toBe(
      "/api/projects/project/invoices/2?download=1"
    )
  })
})

describe("opening", () => {
  it("opens a cycle's D3.5 only once that cycle's D3.4 locks", async () => {
    await lockTerms()

    expect(await openD35()).toEqual([])

    await approveTrigger(1, fabrication)

    expect(await openD35()).toEqual([])

    await addRecord("D3.4", invoice(), 1)

    expect(await openD35()).toEqual([{ toolId: "D3.5", cycle: 1 }])
  })

  it("does not open another cycle's D3.5 from a locked D3.4", async () => {
    await lockTerms()
    await approveTrigger(2, handover)
    await addRecord("D3.4", invoice(), 2)

    expect(await openD35()).toEqual([])
  })
})

describe("starting values", () => {
  it("shows the request, the PM as Head of Finance, the client and the day D3.4 locked", async () => {
    await openApproval()

    expect(await approvedInvoiceValues(database, projectId, null, 1)).toEqual({
      projectClientName: "Rice Mill / Asante Mills",
      requestId: expect.stringMatching(/^Tier_1-/),
      reviewingOfficer: "Ama Owusu",
      dateReceived: "2026-11-18",
    })
  })

  it("fills the bank, branch, payment window and both amounts into the checks", async () => {
    await openApproval()

    expect(await approvedInvoiceFills(database, projectId, 1)).toMatchObject({
      "Bank Name": expect.stringContaining("Placeholder"),
      Branch: expect.any(String),
      N: "21",
      "Invoice Total": "GHS 43,424.00",
      "Milestone Value": "GHS 37,760.00",
    })
  })

  it("reads its own cycle's D3.4 and values through the tool page's system values", async () => {
    await openApproval()

    expect(
      await systemValuesOf(database, projectId, "D3.5", null, undefined, 1)
    ).toMatchObject({
      projectClientName: "Rice Mill / Asante Mills",
      reviewingOfficer: "Ama Owusu",
      dateReceived: "2026-11-18",
    })

    expect(
      (await previewStates(database, pm, projectId, d35, 1)).referenceDraft
    ).toMatchObject({
      status: "ready",
      href: `/api/projects/${projectId}/tools/D3.4/pdf?cycle=1`,
    })
  })
})

describe("submitting", () => {
  it("refuses without the Head of Finance's signature", async () => {
    await openApproval()

    const record = await draft()

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "pmSignature",
    ])
  })

  it("refuses Yes while any check is Fail", async () => {
    await openApproval()

    const record = await signed(approval({ checklist: checks([1]) }))

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "authorized",
    ])
  })

  it("refuses No while every check is Pass", async () => {
    await openApproval()

    const record = await signed(approval({ authorized: NO }))

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "authorized",
    ])
  })

  it("refuses a Fail with no comment, and a check with no answer", async () => {
    await openApproval()

    const failed = checks([1]).map((row, index) =>
      index === 1 ? { point: qualityChecks[1]!.point, status: FAIL } : row
    )

    const record = await signed(approval({ checklist: failed, authorized: NO }))

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "checklist",
    ])

    await updateRecord(
      database,
      pm,
      record.id,
      approval({
        checklist: qualityChecks.map((check, index) => ({
          ...check,
          ...(index > 0 && { status: PASS }),
        })),
        authorized: NO,
      })
    )

    expect(await refusal(submitRecord(database, pm, record.id))).toEqual([
      "checklist",
    ])
  })

  it("locks on Yes and sets both conversion tasks Done", async () => {
    await openApproval()

    const record = await signed()
    const lockedRecord = await submitRecord(database, pm, record.id)

    expect(lockedRecord.state).toBe("locked")
    expect(lockedRecord.payload.conversion).toMatchObject(
      conversionTasks.map((task) => ({ ...task, status: DONE }))
    )
  })

  it("locks on No and leaves the conversion tasks Pending", async () => {
    await openApproval()

    const record = await signed(
      approval({ checklist: checks([1]), authorized: NO })
    )

    const lockedRecord = await submitRecord(database, pm, record.id)

    expect(lockedRecord.state).toBe("locked")
    expect(lockedRecord.payload.conversion).toMatchObject(
      conversionTasks.map((task) => ({ ...task, status: PENDING }))
    )
  })
})

describe("approving", () => {
  it("shows the invoice the client receives once Yes locks it", async () => {
    await openApproval()

    const record = await signed()

    expect(await shownInvoice(database, pm, projectId, 1)).toBeNull()

    await submitRecord(database, pm, record.id)

    const invoice = await shownInvoice(database, pm, projectId, 1)

    expect(invoice).toMatchObject({
      fileName: "IMHO_INV26_001_AsanteMills.pdf",
      invoiceNumber: "IMHO-INV26-001",
      invoiceDate: new Date().toISOString().slice(0, 10),
      clientName: "Asante Mills",
      billingAddress: "Asante Mills\nTema Industrial Area, Accra",
      projectName: "Rice Mill",
      subtotal: 37760,
      vat: 5664,
      total: 43424,
      paymentTerms: "21 Days from Issuance",
      latePenalty: "2% Monthly Interest on outstanding balance",
    })
    expect(invoice!.lines).toEqual([
      {
        description: "Fabrication Milestone (Design Approval) (40% Milestone)",
        quantity: 1,
        unitPrice: 37760,
        total: 37760,
      },
    ])
    expect(invoice!.bank.accountName).toBe("IMHOGEN LTD")

    const pdf = await invoicePdf(invoice!)

    expect(pdf.fileName).toBe("IMHO_INV26_001_AsanteMills.pdf")
    expect(pdf.content.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("has no invoice after No, or before Yes", async () => {
    await openApproval()

    const record = await signed(
      approval({ checklist: checks([1]), authorized: NO })
    )

    await submitRecord(database, pm, record.id)

    expect(await shownInvoice(database, pm, projectId, 1)).toBeNull()

    await expect(
      approvedInvoice(database, pm, projectId, 1)
    ).rejects.toBeInstanceOf(InvoiceNotFoundError)
  })
})

describe("sending back", () => {
  it("sends that cycle's D3.4 back to the FO with the comments as the reason", async () => {
    const d34 = await openApproval()

    const record = await signed(
      approval({ checklist: checks([1]), authorized: NO })
    )

    const lockedRecord = await submitRecord(database, pm, record.id)
    const back = await getRecord(database, fo, d34)

    expect(lockedRecord.state).toBe("locked")
    expect(back.state).toBe("draft")
    expect(back.payload.invoiceNumber).toBe("IMHO-INV26-001")
    expect(back.payload.foSignature).toBeUndefined()
    expect(await sentBackReason(database, back)).toBe(
      "D3.5 sent it back: No. 2.2: VAT should be 15% of the subtotal"
    )
    expect(await titlesFor(fo)).toContain("D3.4 was sent back to you")
  })

  it("reopens D3.5 once that D3.4 is locked again, and the invoice follows the revision", async () => {
    const d34 = await openApproval()

    const record = await signed(
      approval({ checklist: checks([1]), authorized: NO })
    )

    await submitRecord(database, pm, record.id)

    await updateRecord(database, fo, d34, {
      billingAddress: "PO Box 12, Tema",
      lineItems: [
        {
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        },
        {},
      ],
      vat: 5664,
      draftComplete: "Yes",
    })
    await signField(database, fo, d34, "foSignature")
    await submitRecord(database, fo, d34)

    const again = await getRecord(database, pm, record.id)

    expect(again.state).toBe("draft")
    expect(again.payload.pmSignature).toBeUndefined()
    expect(await titlesFor(pm)).toContain("D3.5 is open again")

    await updateRecord(database, pm, record.id, approval())
    await signField(database, pm, record.id, "pmSignature")
    await submitRecord(database, pm, record.id)

    expect(
      (await shownInvoice(database, pm, projectId, 1))?.billingAddress
    ).toBe("PO Box 12, Tema")
  })

  it("sends back only the same milestone's D3.4", async () => {
    await lockTerms()
    await lockInvoice(1, fabrication)
    await lockInvoice(2, handover, invoice({ invoiceNumber: "IMHO-INV26-002" }))

    const record = await signed(
      approval({ checklist: checks([1]), authorized: NO }),
      2
    )

    await submitRecord(database, pm, record.id)

    const { rows } = await database.pool.query<{
      cycle: number
      state: string
    }>(
      "SELECT cycle, state FROM tool_records WHERE project_id = $1 AND tool_id = 'D3.4' ORDER BY cycle",
      [projectId]
    )

    expect(rows).toEqual([
      { cycle: 1, state: "locked" },
      { cycle: 2, state: "draft" },
    ])
  })
})

describe("cycles", () => {
  it("names each cycle by its D3.3's milestone, and shows the next cycle once D3.4 locks", async () => {
    await lockTerms()
    await lockInvoice(1, fabrication)

    const first = await signed()

    await submitRecord(database, pm, first.id)

    await lockInvoice(2, handover, invoice({ invoiceNumber: "IMHO-INV26-002" }))

    const status = await toolStatus(database, projectId, "D3.5")

    expect(status.cycle).toBe(2)

    expect(
      (await cyclesOf(database, projectId, "D3.5", status)).map(
        (each) => each.label
      )
    ).toEqual([fabrication, handover])
  })
})

describe("who sees it", () => {
  it("lets the PM write it as Head of Finance, the FO, HE and CR read it, and nobody else see it", async () => {
    const he = await addPerson("Kojo Mensah", ["HE"])
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, pm, projectId, "D3.5", "write")).toBe(true)

    for (const reader of [fo, he, cr]) {
      expect(await can(database, reader, projectId, "D3.5", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.5", "write")).toBe(
        false
      )
    }

    for (const outsider of [om, client]) {
      expect(await can(database, outsider, projectId, "D3.5", "read")).toBe(
        false
      )
    }

    await openApproval()

    await expect(
      saveDraft(database, fo, {
        projectId,
        toolId: "D3.5",
        cycle: 1,
        values: approval(),
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    await expect(
      approvedInvoice(database, client, projectId, 1)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
