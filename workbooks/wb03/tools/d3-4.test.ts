import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { PROCEED } from "@/lib/billing-trigger"
import {
  invoiceCells,
  invoiceSums,
  paymentDueText,
  percentIn,
} from "@/lib/draft-invoice"
import { periodOf } from "@/lib/sequences"
import {
  draftInvoiceStart,
  draftInvoiceValues,
} from "@/server/payments/draft-invoice"
import { previewStates } from "@/server/pdf/previews"
import { can } from "@/server/permissions/permissions"
import { cyclesOf } from "@/server/records/cycles"
import {
  ValidationError,
  getRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
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

const database = createTestDatabase()

tools.registerTool(d31)

tools.registerTool(d33)

tools.registerTool(d34)

tools.registerTool(d35)

tools.registerTool(d36)

tools.registerTool(d37)

tools.registerTool(d38)

tools.registerTool(d39)

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

// WB01 and WB02 open their tools at once; WB03 runs its real order, with
// D3.3 and D3.4 once per payment milestone.
loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

const fabrication = "2.2 Fabrication Milestone (Design Approval)"

const handover = "2.3 Final Handover (System Delivery)"

const year = periodOf(new Date())

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
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, locked_at) VALUES ($1, $2, $3, 'locked', $4, '2026-11-18T09:00:00Z')",
    [on, toolId, cycle, payload]
  )
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
}

function invoice(values: JsonObject = {}): JsonObject {
  return {
    billingAddress: "Asante Mills\nTema Industrial Area, Accra",
    lineItems: [line, {}],
    vat: 5664,
    draftComplete: "Yes",
    ...values,
  }
}

async function draft(cycle: number, values: JsonObject = invoice()) {
  return saveDraft(database, fo, { projectId, toolId: "D3.4", cycle, values })
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

async function openD34() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D3.4"
  )
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

describe("sums", () => {
  it("reads the first percentage and the payment window from D3.1's terms", () => {
    expect(percentIn("All prices are exclusive of 15% VAT")).toBe(15)
    expect(percentIn("VAT 12.5% applies")).toBe(12.5)
    expect(percentIn("A levy of .5% applies")).toBe(0.5)
    expect(percentIn("No VAT applies")).toBeUndefined()
    expect(paymentDueText("Net 21 Days from Invoice Issuance")).toBe(
      "21 Days from Issuance"
    )
    expect(paymentDueText("On receipt")).toBe("")
  })

  it("adds the lines, the VAT and the total as the sheet is typed", () => {
    const values = {
      lineItems: [
        line,
        { description: "Site visit", quantity: 2, unitPrice: 250.5 },
      ],
      vat: 5739.15,
    }

    expect(invoiceSums(values)).toEqual({
      subtotal: 38261,
      vat: 5739.15,
      total: 44000.15,
    })
    expect(invoiceCells(values)).toEqual({
      subtotal: "GHS 38,261.00",
      totalAmountDue: "GHS 44,000.15",
    })
  })
})

describe("opening", () => {
  it("opens a cycle's D3.4 only once the FO approves that cycle's D3.3", async () => {
    await lockTerms()

    expect(await openD34()).toEqual([])

    await approveTrigger(1, fabrication)

    expect(await openD34()).toEqual([{ toolId: "D3.4", cycle: 1 }])

    // The next D3.3 opens alongside it.
    expect(
      (await availableTools(database, projectId)).filter(
        (each) => each.toolId === "D3.3"
      )
    ).toEqual([{ toolId: "D3.3", cycle: 2 }])
  })

  it("opens the same cycle's D3.5 once it locks", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)
    await addRecord("D3.4", invoice(), 1)

    expect(
      (await availableTools(database, projectId)).filter((each) =>
        each.toolId.startsWith("D3.")
      )
    ).toEqual([
      { toolId: "D3.3", cycle: 2 },
      { toolId: "D3.5", cycle: 1 },
    ])
  })
})

describe("starting values", () => {
  it("starts on the milestone's line, D3.1's amount, 15% VAT and the web request's address", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)

    expect(await draftInvoiceStart(database, projectId, 1)).toEqual({
      billingAddress: "Asante Mills\nTema Industrial Area, Accra",
      lineItems: [line, {}],
      vat: 5664,
    })
  })

  it("starts a later invoice on the address used on the one before", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)
    await approveTrigger(2, handover)
    await addRecord("D3.4", invoice({ billingAddress: "PO Box 12, Tema" }), 1)

    const start = await draftInvoiceStart(database, projectId, 2)

    expect(start.billingAddress).toBe("PO Box 12, Tema")
    expect(start.lineItems).toEqual([
      {
        description: "Final Handover (System Delivery) (20% Milestone)",
        quantity: 1,
        unitPrice: 18880,
      },
      {},
    ])
    expect(start.vat).toBe(2832)
  })

  it("starts the VAT at nothing when D3.1's tax term names no percentage", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)
    await database.pool.query(
      `UPDATE tool_records SET payload = jsonb_set(payload, '{complianceRules,2,term}', '"No VAT applies"') WHERE tool_id = 'D3.1'`
    )

    expect((await draftInvoiceStart(database, projectId, 1)).vat).toBe(0)
  })

  it("shows the bank details, the payment window and D3.1's late penalty", async () => {
    await lockTerms()

    const values = await draftInvoiceValues(database, projectId, {
      payload: invoice(),
    })

    expect(values).toMatchObject({
      accountName: "IMHOGEN LTD",
      paymentDueDate: "21 Days from Issuance",
      latePenalty: "2% Monthly Interest on outstanding balance",
      vatRate: 15,
      subtotal: "GHS 37,760.00",
      totalAmountDue: "GHS 43,424.00",
    })
    expect(values.bankName).toContain("Placeholder")
  })
})

describe("invoice number", () => {
  it("gives the next number on the first save and keeps it on every save", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)

    const record = await draft(1)

    expect(record.payload.invoiceNumber).toBe(`IMHO-INV${year}-001`)

    const saved = await saveDraft(database, fo, {
      projectId,
      toolId: "D3.4",
      cycle: 1,
      values: invoice({ billingAddress: "PO Box 12, Tema" }),
      expectedUpdatedAt: record.updatedAt,
    })

    expect(saved.payload.invoiceNumber).toBe(`IMHO-INV${year}-001`)
  })

  it("refuses a number typed in the form", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)

    const record = await draft(1)

    expect(
      await refusal(
        updateRecord(
          database,
          fo,
          record.id,
          invoice({ invoiceNumber: "IMHO-INV26-999" })
        )
      )
    ).toEqual(["invoiceNumber"])
  })

  it("never gives two projects drafting at once the same number", async () => {
    const other = await addProject("Cassava Plant")
    const otherFo = await addPerson("Kofi Darko", ["FO"], other)

    await lockTerms()
    await lockTerms(other)
    await approveTrigger(1, fabrication)
    await approveTrigger(1, fabrication, other)

    const [first, second] = await Promise.all([
      draft(1),
      saveDraft(database, otherFo, {
        projectId: other,
        toolId: "D3.4",
        cycle: 1,
        values: invoice(),
      }),
    ])

    expect(
      [first.payload.invoiceNumber, second.payload.invoiceNumber].sort()
    ).toEqual([`IMHO-INV${year}-001`, `IMHO-INV${year}-002`])

    // The next milestone's invoice takes the number after them.
    await approveTrigger(2, handover)

    expect((await draft(2)).payload.invoiceNumber).toBe(`IMHO-INV${year}-003`)
  })
})

describe("submitting", () => {
  async function signed(values: JsonObject) {
    await lockTerms()
    await approveTrigger(1, fabrication)

    const record = await draft(1, values)

    await signField(database, fo, record.id, "foSignature")

    return record
  }

  it("refuses without an address", async () => {
    const record = await signed(invoice({ billingAddress: "" }))

    expect(await refusal(submitRecord(database, fo, record.id))).toContain(
      "billingAddress"
    )
  })

  it("refuses a half-filled line, and no lines at all", async () => {
    const half = await signed(
      invoice({ lineItems: [line, { description: "Site visit" }] })
    )

    expect(await refusal(submitRecord(database, fo, half.id))).toEqual([
      "lineItems",
      "lineItems",
    ])

    await updateRecord(database, fo, half.id, invoice({ lineItems: [{}, {}] }))
    await signField(database, fo, half.id, "foSignature")

    expect(await refusal(submitRecord(database, fo, half.id))).toEqual([
      "lineItems",
    ])
  })

  it("refuses with 4.0 No, or unsigned", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)

    const record = await draft(1, invoice({ draftComplete: "No" }))

    expect(await refusal(submitRecord(database, fo, record.id))).toEqual(
      expect.arrayContaining(["draftComplete", "foSignature"])
    )
  })

  it("locks on submit, storing the sums and who drafted it", async () => {
    const record = await signed(
      invoice({
        lineItems: [
          line,
          { description: "Site visit", quantity: 2, unitPrice: 250 },
        ],
        vat: 1000,
      })
    )

    const locked = await submitRecord(database, fo, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      invoiceNumber: `IMHO-INV${year}-001`,
      generatedBy: "Esi Badu",
      lineItems: [
        { ...line, totalAmount: 37760 },
        {
          description: "Site visit",
          quantity: 2,
          unitPrice: 250,
          totalAmount: 500,
        },
      ],
      subtotal: 38260,
      vat: 1000,
      totalAmountDue: 39260,
    })
    expect(locked.payload.dateDrafted).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const read = await getRecord(database, pm, record.id)

    expect(read.state).toBe("locked")
  })
})

describe("cycles", () => {
  it("names each cycle by its D3.3's milestone and shows that D3.3 as the trigger", async () => {
    await lockTerms()
    await approveTrigger(1, fabrication)
    await approveTrigger(2, handover)
    await addRecord("D3.4", invoice(), 1)

    const status = await toolStatus(database, projectId, "D3.4")

    expect(status.cycle).toBe(2)
    expect(
      (await cyclesOf(database, projectId, "D3.4", status)).map(
        (each) => each.label
      )
    ).toEqual([fabrication, handover])

    const states = await previewStates(database, fo, projectId, d34, 2)

    expect(states.referenceTrigger).toMatchObject({
      status: "ready",
      href: `/api/projects/${projectId}/tools/D3.3/pdf?cycle=2`,
    })
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const he = await addPerson("Kojo Mensah", ["HE"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    expect(await can(database, fo, projectId, "D3.4", "write")).toBe(true)

    for (const reader of [pm, cr]) {
      expect(await can(database, reader, projectId, "D3.4", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.4", "write")).toBe(
        false
      )
    }

    for (const outsider of [he, client]) {
      expect(await can(database, outsider, projectId, "D3.4", "read")).toBe(
        false
      )
    }
  })
})
