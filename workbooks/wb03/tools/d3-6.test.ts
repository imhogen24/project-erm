import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { invoicePath } from "@/lib/approved-invoice"
import { PROCEED } from "@/lib/billing-trigger"
import {
  dueDateOf,
  reminderDayOf,
  scriptFor,
  sentInvoiceEmailPath,
  subjectFor,
} from "@/lib/transmitted-invoice"
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
import { approvedInvoice } from "@/server/payments/approved-invoice"
import {
  sendInvoiceReminders,
  sendTransmittedInvoice,
  transmittedInvoiceFills,
  transmittedInvoiceStart,
  transmittedInvoiceValues,
} from "@/server/payments/transmitted-invoice"
import { previewStates } from "@/server/pdf/previews"
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
import { d33 } from "./d3-3"
import { d34 } from "./d3-4"
import { d35 } from "./d3-5"
import { d36 } from "./d3-6"
import { d37 } from "./d3-7"

const database = createTestDatabase()

tools.registerTool(d31)

tools.registerTool(d33)

tools.registerTool(d34)

tools.registerTool(d35)

tools.registerTool(d36)

tools.registerTool(d37)

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

const SENT_AT = new Date("2026-11-18T10:30:00Z")

const CLIENT_EMAIL = "accounts@asantemills.test"

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
        email: CLIENT_EMAIL,
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

async function addRecord(toolId: string, payload: JsonObject = {}, cycle = 1) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, $3, 'locked', $4, $5, $5) RETURNING id",
    [projectId, toolId, cycle, payload, "2026-11-17T09:00:00Z"]
  )

  return rows[0]!.id
}

// D3.1 locked with three milestones and the sheet's terms, and a window of
// `window`.
async function lockTerms(window = "Net 21 Days from Invoice Issuance") {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
    await addRecord(toolId)
  }

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
    complianceRules: [
      { term: window },
      { term: "2% Monthly Interest on outstanding balance" },
      { term: "All prices are exclusive of 15% VAT" },
      { term: "Ghana Cedis (GHS) ONLY" },
    ],
  })
}

// A cycle's D3.3, D3.4 and D3.5 locked, D3.5 with `authorized`.
async function approveInvoice(
  cycle = 1,
  milestone = fabrication,
  authorized = "Yes"
) {
  await addRecord(
    "D3.3",
    { milestone, actionTaken: PROCEED, clientAccepted: "Yes" },
    cycle
  )

  await addRecord(
    "D3.4",
    {
      invoiceNumber: `IMHO-INV26-00${cycle}`,
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
    cycle
  )

  await addRecord("D3.5", { authorized }, cycle)
}

async function openD36() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.6"
  )
}

// The FO's draft, from the starting values, with any change.
async function draft(values: JsonObject = {}, cycle = 1) {
  const start = await transmittedInvoiceStart(
    database,
    projectId,
    cycle,
    SENT_AT
  )

  return saveDraft(database, fo, {
    projectId,
    toolId: "D3.6",
    cycle,
    values: { ...start, ...values },
  })
}

async function send(id: string, via: Transport = transport, now = SENT_AT) {
  return sendTransmittedInvoice(database, fo, id, { transport: via, now })
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

describe("the payment clock", () => {
  it("is due the payment window's days after sending, and reminds 7 days before", () => {
    expect(dueDateOf("2026-11-18", 21)).toBe("2026-12-09")
    expect(dueDateOf("2026-11-18", undefined)).toBeUndefined()
    expect(reminderDayOf("2026-11-18", "2026-12-09")).toBe("2026-12-02")
    expect(reminderDayOf("2026-11-18", "2026-11-25")).toBeUndefined()
    expect(reminderDayOf("2026-11-18", undefined)).toBeUndefined()
  })

  it("names the invoice and project in the subject, and keeps a [name] not known yet", () => {
    expect(subjectFor("IMHO-INV26-001", "Rice Mill")).toBe(
      "IMHO GEN Invoice IMHO-INV26-001 - Rice Mill"
    )
    expect(subjectFor("", "")).toBe(
      "IMHO GEN Invoice [Insert Inv #] - [Project Name]"
    )
    expect(scriptFor({})).toContain("Dear [Client Name]")
  })
})

describe("opening", () => {
  it("opens a cycle's D3.6 only once that cycle's D3.5 approves the invoice", async () => {
    await lockTerms()
    await approveInvoice(1, fabrication, "No")

    expect(await openD36()).toEqual([])

    await database.pool.query(
      "UPDATE tool_records SET payload = $1 WHERE tool_id = 'D3.5'",
      [{ authorized: "Yes" }]
    )

    expect(await openD36()).toEqual([{ toolId: "D3.6", cycle: 1 }])
  })

  it("does not open another cycle's D3.6", async () => {
    await lockTerms()
    await approveInvoice(2, handover)

    expect(await openD36()).toEqual([])
  })
})

describe("starting values", () => {
  it("starts from the client's email and the sheet's message, filled in", async () => {
    await lockTerms()
    await approveInvoice()

    const start = await transmittedInvoiceStart(database, projectId, 1, SENT_AT)

    expect(start.sentTo).toBe(CLIENT_EMAIL)
    expect(start.script).toContain("Dear Asante Mills")
    expect(start.script).toContain(
      "Fabrication Milestone (Design Approval) has been successfully completed"
    )
    expect(start.script).toContain(
      "Invoice IMHO-INV26-001 for the amount of GHS 43,424.00"
    )
    expect(start.script).toContain("due within 21 days of this notice")
    expect(start.script).toContain("(by 09/12/2026)")
    expect(start.script).toContain("Placeholder")
  })

  it("shows the PM, the subject, the due date if sent today and the window", async () => {
    await lockTerms()
    await approveInvoice()

    expect(
      await transmittedInvoiceValues(database, projectId, {}, 1, SENT_AT)
    ).toEqual({
      requestId: expect.stringMatching(/^Tier_1-/),
      ccBcc: "ama.owusu@imhogen.test",
      subject: "IMHO GEN Invoice IMHO-INV26-001 - Rice Mill",
      paymentDueDate: "2026-12-09",
    })

    expect(await transmittedInvoiceFills(database, projectId)).toEqual({
      N: "21",
    })

    const states = await previewStates(database, fo, projectId, d36, 1)

    expect(states.fileAttached).toEqual({
      status: "ready",
      name: "IMHO_INV26_001_AsanteMills.pdf",
      href: invoicePath(projectId, 1),
    })
  })

  it("starts the next milestone with the email used on this one", async () => {
    await lockTerms()
    await approveInvoice()

    const first = await draft({ sentTo: "billing@asantemills.test" })

    await send(first.id)
    await approveInvoice(2, handover)

    const next = await transmittedInvoiceStart(database, projectId, 2)

    expect(next.sentTo).toBe("billing@asantemills.test")
  })
})

describe("sending", () => {
  it("refuses an invalid email, or none, and sends nothing", async () => {
    await lockTerms()
    await approveInvoice()

    await expect(draft({ sentTo: "not-an-email" })).rejects.toThrow(
      "Must be an email address"
    )

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.6",
      cycle: 1,
      values: { script: "Dear Asante Mills" },
    })

    await expect(send(record.id)).rejects.toBeInstanceOf(SendNotReadyError)
    expect(transport.sent).toEqual([])
  })

  it("emails the invoice PDF to the client, copies the PM, fills 1.0 and 3.0 and locks", async () => {
    await lockTerms()
    await approveInvoice()

    const record = await draft()
    const sent = await send(record.id)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe(CLIENT_EMAIL)
    expect(email.cc).toEqual(["ama.owusu@imhogen.test"])
    expect(email.subject).toBe("IMHO GEN Invoice IMHO-INV26-001 - Rice Mill")
    expect(email.text).toContain("Dear Asante Mills")
    expect(email.attachments?.[0]).toMatchObject({
      filename: "IMHO_INV26_001_AsanteMills.pdf",
      contentType: "application/pdf",
    })

    expect(sent.state).toBe("locked")
    expect(sent.payload).toMatchObject({
      dateSent: "2026-11-18",
      timeSent: "10:30",
      paymentDueDate: "2026-12-09",
      ccBcc: "ama.owusu@imhogen.test",
      sentEmailLink: sentInvoiceEmailPath(projectId, 1),
      paymentClockStarted: "Yes",
      reminderScheduled: "Yes",
    })

    expect((await sentEmailOf(database, record.id))?.attachments).toEqual([
      "IMHO_INV26_001_AsanteMills.pdf",
    ])

    await expect(
      updateRecord(database, fo, record.id, { sentTo: "x@y.test" })
    ).rejects.toBeInstanceOf(RecordNotEditableError)
  })

  it("moves the message's due date to the day it is sent", async () => {
    await lockTerms()
    await approveInvoice()

    const record = await draft()
    const later = new Date("2026-11-20T08:00:00Z")

    await database.pool.query(
      "UPDATE tool_records SET created_at = $1 WHERE id = $2",
      ["2026-11-18T09:00:00Z", record.id]
    )

    const sent = await send(record.id, transport, later)

    expect(sent.payload.paymentDueDate).toBe("2026-12-11")
    expect(transport.sent[0]!.text).toContain("(by 11/12/2026)")
  })

  it("sends one email when pressed twice", async () => {
    await lockTerms()
    await approveInvoice()

    const record = await draft()

    await send(record.id)
    await expect(send(record.id)).rejects.toThrow()

    expect(transport.sent).toHaveLength(1)
  })

  it("finishes a send cut short after it was prepared, sending one email", async () => {
    await lockTerms()
    await approveInvoice()

    const record = await draft()

    await send(record.id)
    // As if the lock after the email was cut short.
    await database.pool.query(
      "UPDATE tool_records SET state = 'draft', payload = payload - 'paymentClockStarted' WHERE id = $1",
      [record.id]
    )

    const finished = await send(record.id)

    expect(finished.state).toBe("locked")
    expect(finished.payload.paymentClockStarted).toBe("Yes")
    expect(transport.sent).toHaveLength(1)
  })

  it("marks nothing sent when the email service refuses it", async () => {
    await lockTerms()
    await approveInvoice()

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
    expect(after.payload.dateSent).toBeUndefined()
    expect(after.payload.paymentClockStarted).toBeUndefined()
  })

  it("schedules no reminder when the due date is 7 days away or less", async () => {
    await lockTerms("Net 7 Days from Invoice Issuance")
    await approveInvoice()

    const sent = await send((await draft()).id)

    expect(sent.payload).toMatchObject({
      paymentDueDate: "2026-11-25",
      paymentClockStarted: "Yes",
      reminderScheduled: "No",
    })
  })
})

describe("the reminder", () => {
  it("reminds the client once on day 14 of 21, copying the PM", async () => {
    await lockTerms()
    await approveInvoice()
    await send((await draft()).id)
    transport.sent.length = 0

    const remind = (day: string) =>
      sendInvoiceReminders(database, {
        transport,
        now: new Date(`${day}T09:00:00Z`),
      })

    expect(await remind("2026-12-01")).toBe(0)
    expect(await remind("2026-12-02")).toBe(1)
    expect(await remind("2026-12-03")).toBe(0)

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: CLIENT_EMAIL,
      cc: ["ama.owusu@imhogen.test"],
      subject: "Reminder: IMHO GEN Invoice IMHO-INV26-001 - Rice Mill",
    })
  })

  it("does not remind once the milestone's payment is reconciled", async () => {
    await lockTerms()
    await approveInvoice()
    await send((await draft()).id)
    await addRecord("D3.8", {}, 1)

    expect(
      await sendInvoiceReminders(database, {
        transport,
        now: new Date("2026-12-02T09:00:00Z"),
      })
    ).toBe(0)
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM and CR read it, the client read it once sent, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.6", "write")).toBe(true)

    for (const reader of [pm, cr, client]) {
      expect(await can(database, reader, projectId, "D3.6", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.6", "write")).toBe(
        false
      )
    }

    expect(await can(database, om, projectId, "D3.6", "read")).toBe(false)

    await lockTerms()
    await approveInvoice()

    const record = await draft()

    await expect(
      saveDraft(database, pm, {
        projectId,
        toolId: "D3.6",
        cycle: 1,
        values: { sentTo: "x@y.test" },
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    // Before it is sent, the client sees nothing of it, nor the invoice.
    expect((await getRecord(database, client, record.id)).payload).toEqual({})
    await expect(
      approvedInvoice(database, client, projectId, 1)
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    await send(record.id)

    expect(
      (await getRecord(database, client, record.id)).payload.dateSent
    ).toBe("2026-11-18")
    expect(
      (await approvedInvoice(database, client, projectId, 1)).fileName
    ).toBe("IMHO_INV26_001_AsanteMills.pdf")
  })
})
