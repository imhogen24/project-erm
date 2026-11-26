import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { columnSum, computedCells } from "@/lib/computed-columns"
import {
  complianceRules,
  currencyTerm,
  paymentMilestones,
} from "@/lib/payment-terms"
import {
  paymentTermsStart,
  paymentTermsValues,
} from "@/server/payments/payment-terms"
import { can } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d31 } from "./d3-1"

const database = createTestDatabase()

tools.registerTool(d31)

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12"],
})

let projectId: string

let fo: string

let pm: string

const rows = z.array(z.record(z.string(), z.unknown()))

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

// Workbook 2 done as far as D2.12: the contract worth GHS 94,400.00 with 40%
// due on execution, in GHS.
async function reachExtract() {
  await addRecord("D1.16")
  await addRecord("D2.1", { executionPercentage: 40, currency: "GHS" })
  await addRecord("D2.2", {
    coreVariables: [
      { variable: "Client Legal Name", value: "Asante Mills" },
      { variable: "Client Representative", value: "Kwaku Ampofo" },
      { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
    ],
  })
  await addRecord("D2.6")
  await addRecord("D2.12")
}

function extract(values: JsonObject = {}): JsonObject {
  return {
    paymentSchedule: paymentMilestones.map((milestone, index) => ({
      milestone,
      percentage: [40, 40, 20][index]!,
      clauseRef: `Section 3.3.${index + 1}`,
    })),
    complianceRules: complianceRules.map(({ category, term }, index) => ({
      category,
      term,
      clauseRef: `Section 4.${index + 1}`,
    })),
    accepted: "Yes",
    ...values,
  }
}

async function draft(values: JsonObject = extract()) {
  return saveDraft(database, fo, {
    projectId,
    toolId: "D3.1",
    cycle: 1,
    values,
  })
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

describe("worked-out columns", () => {
  it("works out each row's share of the total, as text or a number", () => {
    const values: JsonObject = {
      totalProjectValue: "GHS 94,400.00",
      paymentSchedule: [{ percentage: 40 }, { percentage: "12.5" }, {}],
    }

    expect(computedCells(d31.fields, values)).toEqual({
      paymentSchedule: [
        { percentage: 40, amountDue: "GHS 37,760.00" },
        { percentage: "12.5", amountDue: "GHS 11,800.00" },
        { amountDue: "" },
      ],
    })
    expect(
      computedCells(
        d31.fields,
        { ...values, totalProjectValue: 94400 },
        "stored"
      )
    ).toEqual({
      paymentSchedule: [
        { percentage: 40, amountDue: 37760 },
        { percentage: "12.5", amountDue: 11800 },
        { amountDue: null },
      ],
    })
  })

  it("adds up a column", () => {
    expect(columnSum([{ p: 33.33 }, { p: 33.33 }, { p: 33.34 }, {}], "p")).toBe(
      100
    )
  })

  it("refuses a computed column that is not a system amount of a percentage", () => {
    expect(() =>
      defineTool({
        id: "X1",
        name: "Bad",
        workbook: "wb03",
        tier: "both",
        fields: [
          {
            key: "rows",
            label: "Rows",
            type: "table",
            columns: [
              { key: "share", label: "Share", type: "text" },
              {
                key: "due",
                label: "Due",
                type: "currency",
                systemFilled: true,
                computed: { times: "share", by: "total" },
              },
            ],
          },
        ],
      })
    ).toThrow("A computed column")
  })

  it("builds the currency term from D2.1's Default Currency", () => {
    expect(currencyTerm("GHS")).toBe("Ghana Cedis (GHS) ONLY")
    expect(currencyTerm(undefined)).toBe("Ghana Cedis (GHS) ONLY")
    expect(currencyTerm("USD")).toBe("USD ONLY")
  })
})

describe("starting D3.1", () => {
  beforeEach(reachExtract)

  it("opens once D2.12 locks", async () => {
    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D3.1")
  })

  it("starts 2.0 on the sheet's milestones with D2.1's advance %, and 3.0 on its terms", async () => {
    expect(await paymentTermsStart(database, projectId)).toEqual({
      paymentSchedule: [
        { milestone: "Advance Payment (Contract Signing)", percentage: 40 },
        { milestone: "Fabrication Milestone (Design Approval)" },
        { milestone: "Final Handover (System Delivery)" },
      ],
      complianceRules: [
        { term: "Net 21 Days from Invoice Issuance" },
        { term: "2% Monthly Interest on outstanding balance" },
        { term: "All prices are exclusive of 15% VAT" },
        { term: "Ghana Cedis (GHS) ONLY" },
      ],
    })
  })

  it("shows the contract total, and who extracted it once submitted", async () => {
    const before = await paymentTermsValues(database, projectId, null)

    expect(before).toMatchObject({ totalProjectValue: "GHS 94,400.00" })
    expect(before).not.toHaveProperty("extractedBy")

    const record = await draft()

    await signField(database, fo, record.id, "foSignature")

    const submitted = await submitRecord(database, fo, record.id)

    const after = await paymentTermsValues(database, projectId, {
      id: submitted.id,
      payload: submitted.payload,
    })

    const today = new Date().toISOString().slice(0, 10)

    expect(after).toMatchObject({
      extractedBy: "Esi Badu",
      extractionDate: today,
      signedDate: today,
    })
  })
})

describe("submitting", () => {
  beforeEach(reachExtract)

  it("refuses until the percentages make 100, every clause ref is in, 4.0 is Yes and the FO signed", async () => {
    const record = await draft(
      extract({
        paymentSchedule: paymentMilestones.map((milestone, index) => ({
          milestone,
          percentage: 30,
          clauseRef: index === 2 ? "" : "Section 3",
        })),
        accepted: "No",
      })
    )

    expect(await refusal(submitRecord(database, fo, record.id))).toEqual(
      expect.arrayContaining(["paymentSchedule"])
    )

    await updateRecord(
      database,
      fo,
      record.id,
      extract({
        paymentSchedule: paymentMilestones.map((milestone) => ({
          milestone,
          percentage: 30,
          clauseRef: "Section 3",
        })),
        accepted: "No",
      })
    )

    expect(await refusal(submitRecord(database, fo, record.id))).toEqual([
      "foSignature",
      "accepted",
      "paymentSchedule",
    ])

    await updateRecord(database, fo, record.id, extract())

    expect(await refusal(submitRecord(database, fo, record.id))).toEqual([
      "foSignature",
    ])
  })

  it("stores each Amount Due, and locks once the PM approves", async () => {
    const record = await draft(
      extract({
        paymentSchedule: [
          ...paymentMilestones.slice(0, 2).map((milestone, index) => ({
            milestone,
            percentage: 40,
            clauseRef: `Section 3.3.${index + 1}`,
          })),
          { milestone: "Retention", percentage: 10, clauseRef: "Section 3.4" },
          { milestone: "Final", percentage: 10, clauseRef: "Section 3.5" },
        ],
      })
    )

    await signField(database, fo, record.id, "foSignature")

    const submitted = await submitRecord(database, fo, record.id)

    expect(
      rows.parse(submitted.payload.paymentSchedule).map((row) => row.amountDue)
    ).toEqual([37760, 37760, 9440, 9440])

    expect((await approveRecord(database, pm, record.id)).state).toBe("locked")
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM approve it, the CA, CR and client read it, and nobody else see it", async () => {
    const ca = await addPerson("Gifty Ofori", ["CA"])
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])
    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, fo, projectId, "D3.1", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D3.1", "approve")).toBe(true)

    for (const reader of [pm, ca, cr, client]) {
      expect(await can(database, reader, projectId, "D3.1", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D3.1", "write")).toBe(
        false
      )
    }

    expect(await can(database, om, projectId, "D3.1", "read")).toBe(false)
  })
})
