import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { invoicePath } from "@/lib/approved-invoice"
import { PROCEED as BANK_PROCEED } from "@/lib/bank-statement-log"
import { PROCEED } from "@/lib/billing-trigger"
import {
  receiptFileName,
  receiptPath,
  receiptScriptFor,
  receiptSubjectFor,
  sentReceiptEmailPath,
} from "@/lib/payment-receipt"
import { formatNumber, periodOf, sequences } from "@/lib/sequences"
import {
  EmailRefusedError,
  SendNotReadyError,
} from "@/server/acknowledgement/acknowledgement"
import { sentEmailOf } from "@/server/contract/transmittal"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import {
  ReceiptNotFoundError,
  paymentReceipt,
  paymentReceiptStart,
  paymentReceiptValues,
  sendPaymentReceipt,
} from "@/server/payments/payment-receipt"
import { previewStates } from "@/server/pdf/previews"
import { receiptPdf } from "@/server/pdf/receipt-pdf"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  RecordNotEditableError,
  getRecord,
  saveDraft,
  updateRecord,
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

const database = createTestDatabase()

for (const tool of [d31, d32, d33, d34, d35, d36, d37, d38, d39]) {
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

const SENT_AT = new Date("2027-01-02T10:30:00Z")

const BILLING_EMAIL = "billing@asantemills.test"

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
        email: "kwame@asantemills.test",
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
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, $3, 'locked', $4, $5, $5) RETURNING id",
    [on, toolId, cycle, payload, "2026-12-31T09:00:00Z"]
  )

  return rows[0]!.id
}

// Everything before D3.9 for 2.2 locked: D3.1's three milestones, the
// trigger, the invoice IMHO-INV26-001 for GHS 43,424.00 approved and sent
// to BILLING_EMAIL, the bank check that found it, and D3.8 with
// `fundsAccounted`, `cleared` clearing in the bank.
async function reconcile(
  fundsAccounted = "Yes",
  cleared = 43424,
  on = projectId
) {
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
      complianceRules: [{ term: "Net 21 Days from Invoice Issuance" }],
    },
    1,
    on
  )

  await addRecord(
    "D3.3",
    { milestone: fabrication, actionTaken: PROCEED, clientAccepted: "Yes" },
    1,
    on
  )
  await addRecord(
    "D3.4",
    {
      invoiceNumber: "IMHO-INV26-001",
      billingAddress: "Asante Mills",
      lineItems: [
        {
          description: "Fabrication Milestone (Design Approval)",
          quantity: 1,
          unitPrice: 37760,
          totalAmount: 37760,
        },
      ],
      subtotal: 37760,
      vat: 5664,
      totalAmountDue: 43424,
    },
    1,
    on
  )
  await addRecord("D3.5", { authorized: "Yes" }, 1, on)
  await addRecord("D3.6", { sentTo: BILLING_EMAIL }, 1, on)
  await addRecord("D3.7", { actionRequired: BANK_PROCEED }, 1, on)
  await addRecord(
    "D3.8",
    {
      fundsAccounted,
      expectedAmount: 43424,
      actualCleared: cleared,
      variance: cleared - 43424,
    },
    1,
    on
  )
}

async function openD39() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.9"
  )
}

// The FO's draft, from the starting values, with any change.
async function draft(values: JsonObject = {}, on = projectId, as = fo) {
  const start = await paymentReceiptStart(database, on, 1)

  return saveDraft(database, as, {
    projectId: on,
    toolId: "D3.9",
    cycle: 1,
    values: { ...start, ...values },
  })
}

async function send(id: string, via: Transport = transport) {
  return sendPaymentReceipt(database, fo, id, { transport: via, now: SENT_AT })
}

// The receipt number the count gives `count`th this year.
function receiptNumber(count: number) {
  return formatNumber(sequences.receipt, periodOf(new Date()), count)
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("the wording", () => {
  it("names the receipt and project in the subject, and keeps a [name] not known yet", () => {
    expect(receiptSubjectFor("IMHO-REC26-002", "Rice Mill")).toBe(
      "IMHO GEN Receipt IMHO-REC26-002 - Rice Mill"
    )
    expect(receiptSubjectFor("", "")).toBe(
      "IMHO GEN Receipt [Receipt #] - [Project Name]"
    )
    expect(receiptScriptFor({})).toContain(
      "your payment of [Insert Amount GHS] regarding Invoice [Insert Inv #]."
    )
  })

  it("names the file after the receipt and the client", () => {
    expect(receiptFileName("IMHO-REC26-002", "Acme Foods")).toBe(
      "IMHO_REC26_002_AcmeFoods.pdf"
    )
    expect(receiptFileName("", "")).toBe("IMHO_REC_Client.pdf")
  })
})

describe("opening", () => {
  it("opens a cycle's D3.9 only once its D3.8 is approved with the funds accounted for", async () => {
    await reconcile("No")

    expect(await openD39()).toEqual([])

    await database.pool.query(
      "UPDATE tool_records SET payload = payload || $1 WHERE tool_id = 'D3.8'",
      [{ fundsAccounted: "Yes" }]
    )

    expect(await openD39()).toEqual([{ toolId: "D3.9", cycle: 1 }])
  })
})

describe("starting values", () => {
  it("starts on Bank Transfer and the sheet's message, filled in and finished", async () => {
    await reconcile()

    const start = await paymentReceiptStart(database, projectId, 1)

    expect(start.paymentMethod).toBe("Bank Transfer")
    expect(start.script).toContain("Dear Asante Mills")
    expect(start.script).toContain(
      "received your payment of GHS 43,424.00 regarding Invoice IMHO-INV26-001."
    )
    expect(start.script).toContain(
      "With this milestone financially cleared, our engineering team will proceed to the next phase of your project."
    )
  })

  it("shows the client, D3.8's amount cleared and the invoice", async () => {
    await reconcile("Yes", 43409)

    expect(await paymentReceiptValues(database, projectId, {}, 1)).toEqual({
      requestId: expect.stringMatching(/^Tier_1-/),
      receivedFrom: "Asante Mills",
      amountReceived: 43409,
    })

    const states = await previewStates(database, fo, projectId, d39, 1)

    expect(states.paidAgainstInvoice).toEqual({
      status: "ready",
      name: "IMHO_INV26_001_AsanteMills.pdf",
      href: invoicePath(projectId, 1),
    })
  })

  it("numbers each receipt when first saved, never giving two projects the same number", async () => {
    await reconcile()

    const first = await draft()

    expect(first.payload.receiptNumber).toBe(receiptNumber(1))

    const again = await updateRecord(database, fo, first.id, {
      paymentMethod: "Cheque",
    })

    expect(again.payload.receiptNumber).toBe(receiptNumber(1))

    const other = await addProject("Cassava Mill")
    const otherFo = await addPerson("Kofi Mensah", ["FO"], other)

    await reconcile("Yes", 43424, other)

    const second = await draft({}, other, otherFo)

    expect(second.payload.receiptNumber).toBe(receiptNumber(2))
  })
})

describe("sending", () => {
  it("refuses to send without a payment method, and sends nothing", async () => {
    await reconcile()

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.9",
      cycle: 1,
      values: { script: "Dear Asante Mills" },
    })

    await expect(send(record.id)).rejects.toBeInstanceOf(SendNotReadyError)
    expect(transport.sent).toEqual([])
  })

  it("emails the receipt PDF to the invoice's address, copies the PM, fills 1.0 and 3.0 and locks", async () => {
    await reconcile()

    const record = await draft({ paymentMethod: "Mobile Money" })
    const number = receiptNumber(1)
    const sent = await send(record.id)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe(BILLING_EMAIL)
    expect(email.cc).toEqual(["ama.owusu@imhogen.test"])
    expect(email.subject).toBe(`IMHO GEN Receipt ${number} - Rice Mill`)
    expect(email.text).toContain("Dear Asante Mills")

    const fileName = receiptFileName(number, "Asante Mills")

    expect(email.attachments?.[0]).toMatchObject({
      filename: fileName,
      contentType: "application/pdf",
    })

    expect(sent.state).toBe("locked")
    expect(sent.payload).toMatchObject({
      receiptNumber: number,
      dateIssued: "2027-01-02",
      timeSent: "10:30",
      receivedFrom: "Asante Mills",
      amountReceived: 43424,
      paymentMethod: "Mobile Money",
      receiptAttached: "Yes",
      sentEmailLink: sentReceiptEmailPath(projectId, 1),
    })

    expect((await sentEmailOf(database, record.id))?.attachments).toEqual([
      fileName,
    ])

    await expect(
      updateRecord(database, fo, record.id, { paymentMethod: "Cash" })
    ).rejects.toBeInstanceOf(RecordNotEditableError)

    const receipt = await paymentReceipt(database, pm, projectId, 1)

    expect(receipt).toMatchObject({
      fileName,
      receiptNumber: number,
      dateIssued: "2027-01-02",
      clientName: "Asante Mills",
      projectName: "Rice Mill",
      invoiceNumber: "IMHO-INV26-001",
      milestone: "Fabrication Milestone (Design Approval)",
      amountReceived: 43424,
      paymentMethod: "Mobile Money",
    })

    const pdf = await receiptPdf(receipt)

    expect(pdf.fileName).toBe(fileName)
    expect(pdf.content.subarray(0, 4).toString()).toBe("%PDF")
    expect(receiptPath(projectId, 1, true)).toBe(
      `/api/projects/${projectId}/receipts/1?download=1`
    )
  })

  it("sends one email when pressed twice", async () => {
    await reconcile()

    const record = await draft()

    await send(record.id)
    await expect(send(record.id)).rejects.toThrow()

    expect(transport.sent).toHaveLength(1)
  })

  it("finishes a send cut short after it was prepared, sending one email", async () => {
    await reconcile()

    const record = await draft()

    await send(record.id)
    // As if the lock after the email was cut short.
    await database.pool.query(
      "UPDATE tool_records SET state = 'draft', payload = payload - 'receiptAttached' WHERE id = $1",
      [record.id]
    )

    const finished = await send(record.id)

    expect(finished.state).toBe("locked")
    expect(finished.payload.receiptAttached).toBe("Yes")
    expect(transport.sent).toHaveLength(1)
  })

  it("marks nothing sent when the email service refuses it", async () => {
    await reconcile()

    const record = await draft()

    const failing: Transport = {
      name: "failing",
      send: async () => {
        throw new Error("Resend is down")
      },
    }

    await expect(send(record.id, failing)).rejects.toBeInstanceOf(
      EmailRefusedError
    )

    const after = await getRecord(database, fo, record.id)

    expect(after.state).toBe("draft")
    expect(after.payload.dateIssued).toBeUndefined()
    expect(after.payload.receiptAttached).toBeUndefined()
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM and CR read it, the client read it once sent, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.9", "write")).toBe(true)

    for (const reader of [pm, cr, client]) {
      expect(await can(database, reader, projectId, "D3.9", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.9", "write")).toBe(
        false
      )
    }

    expect(await can(database, om, projectId, "D3.9", "read")).toBe(false)

    await reconcile()

    const record = await draft()

    await expect(
      saveDraft(database, pm, {
        projectId,
        toolId: "D3.9",
        cycle: 1,
        values: { paymentMethod: "Cash" },
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    // Before it is sent, the client sees nothing of it, nor the receipt.
    expect((await getRecord(database, client, record.id)).payload).toEqual({})
    await expect(
      paymentReceipt(database, client, projectId, 1)
    ).rejects.toBeInstanceOf(ReceiptNotFoundError)

    await send(record.id)

    expect(
      (await getRecord(database, client, record.id)).payload.dateIssued
    ).toBe("2027-01-02")
    expect(
      (await paymentReceipt(database, client, projectId, 1)).receiptNumber
    ).toBe(receiptNumber(1))
    await expect(
      paymentReceipt(database, om, projectId, 1)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
