import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { quoteCells, t3Deliverables } from "@/lib/project-brief"
import {
  briefStart,
  briefValues,
  quoteStart,
} from "@/server/brief/project-brief"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  getRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d115 } from "./d1-15"
import { t3d115a } from "./t3-d1-15a"

const database = createTestDatabase()

tools.registerTool(d115)

tools.registerTool(t3d115a)

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a"] })

// A brief whose budget adds up to D1.14's GHS 94,400.
const brief = {
  targetStartDate: "2026-12-01",
  vision: "Document the unit.",
  objectives: [{ objective: "An accurate 3D model." }],
  phases: [
    {
      phaseNo: "1",
      name: "Review",
      deliverables: "Review.",
      duration: "1 week",
    },
  ],
  budget: [
    { deliverable: "CAD", value: 60000, paymentSchedule: "40% at signing" },
    {
      deliverable: "Prototype",
      value: 34400,
      paymentSchedule: "60% at handover",
    },
  ],
  outOfScope: "Fabrication.",
  clientDependencies: "Site access.",
}

const quote = {
  deliverables: t3Deliverables.map((each) => ({
    ...each,
    qty: 1,
    timeline: "2 weeks",
  })),
  pricing: [
    { description: "Engineering Man-Hours (Drafting)", rate: 500, qty: 80 },
    { description: "Reverse Engineering / Scanning Fee", rate: 15000, qty: 1 },
    { description: "Markup / Admin Fee", rate: 5000, qty: 1 },
  ],
  exclusions: [
    { exclusion: "No Structural Analysis or FEA included." },
    { exclusion: "No Material Selection Advice." },
    { exclusion: "No Fabrication Liability." },
  ],
}

let projectId: string

let le: string

let pm: string

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

async function addRecord(toolId: string, state: string, payload: JsonObject) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, $2, $3, $4) RETURNING id",
    [projectId, toolId, state, payload]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', 'T1-42', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', 'Tier_1', $1, $2)",
    [
      projectId,
      {
        organization_name: "Asante Mills",
        contact_person: "Akosua Mensah",
        email: "akosua@asantemills.test",
        phone_number: "0244 000 001",
        project_title: "Rice mill",
      },
    ]
  )

  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.12", "locked", { realisticTimeline: "8 weeks" })
  await addRecord("D1.13", "locked", {
    vision: "Document the unit.",
    phases: [
      {
        name: "Review",
        activities: "Review.",
        duration: "1 week",
        target: "Week 1",
      },
    ],
    excludedScope: [{ category: "Fabrication", description: "Not built." }],
    clientResponsibilities: [
      { requirement: "Access", description: "Open the site." },
    ],
  })
  await addRecord("D1.14", "locked", {
    allocations: [
      { deliverable: "CAD", cost: 60000 },
      { deliverable: "Prototype", cost: 34400 },
    ],
    totalProjectValue: 94400,
  })
})

afterAll(async () => {
  await database.pool.end()
})

describe("D1.15 project brief", () => {
  it("fills 1.0 from the web request, the project and D1.12", async () => {
    expect(await briefValues(database, projectId)).toEqual({
      requestId: "T1-42",
      clientName: "Asante Mills",
      contactPerson: "Akosua Mensah",
      contactDetails: "akosua@asantemills.test / 0244 000 001",
      projectTitle: "Rice mill",
      duration: "8 weeks",
    })
  })

  it("starts from D1.13's scope and D1.14's allocations", async () => {
    expect(await briefStart(database, projectId)).toEqual({
      vision: "Document the unit.",
      phases: [
        {
          phaseNo: "1",
          name: "Review",
          deliverables: "Review.",
          duration: "1 week",
          target: "Week 1",
        },
      ],
      budget: [
        { deliverable: "CAD", value: 60000 },
        { deliverable: "Prototype", value: 34400 },
      ],
      outOfScope: "Fabrication: Not built.",
      clientDependencies: "Access: Open the site.",
    })
  })

  it("the LE signs and submits, and the PM signs and approves", async () => {
    const id = await addRecord("D1.15", "draft", brief)

    await signField(database, le, id, "headOfRdSignature")
    await submitRecord(database, le, id)
    await signField(database, pm, id, "approverSignature")

    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("refuses a budget that does not add up to D1.14's total", async () => {
    const id = await addRecord("D1.15", "draft", {
      ...brief,
      budget: [{ deliverable: "CAD", value: 90000, paymentSchedule: "All" }],
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      /budget: The budget must add up to D1.14's total project value, GHS 94,400.00/
    )
    expect((await getRecord(database, le, id)).state).toBe("draft")
  })

  it("needs a payment schedule on every budget line", async () => {
    const id = await addRecord("D1.15", "draft", {
      ...brief,
      budget: [{ deliverable: "CAD", value: 94400 }],
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the PM signs the second line", async () => {
    const id = await addRecord("D1.15", "draft", brief)

    await expect(
      signField(database, le, id, "approverSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })
})

describe("T3.D1.15a drafting SOW & quote", () => {
  it("starts with the standard deliverables, described", () => {
    expect(quoteStart()).toMatchObject({
      deliverables: [
        { item: "3D Modeling", format: "STEP" },
        { item: "Drafting Package", format: "PDF/DWG" },
        { item: "BOM Extraction", format: "Excel" },
      ],
    })
  })

  it("works out each line's subtotal and the total as the LE types", () => {
    const cells = quoteCells(quote)

    expect(cells.totalT3ProjectValue).toBe("GHS 60,000.00")
    expect(cells.pricing).toMatchObject([
      { subtotal: "40000" },
      { subtotal: "15000" },
      { subtotal: "5000" },
    ])
  })

  it("stores the subtotals and the total on submit, and the PM approves", async () => {
    await database.pool.query(
      "UPDATE projects SET service_track = 'Tier_3' WHERE id = $1",
      [projectId]
    )

    const id = await addRecord("T3.D1.15a", "draft", quote)

    await signField(database, le, id, "leadEngineerSignature")

    const submitted = await submitRecord(database, le, id)

    expect(submitted.payload).toMatchObject({
      pricing: [{ subtotal: 40000 }, { subtotal: 15000 }, { subtotal: 5000 }],
      totalT3ProjectValue: 60000,
    })
    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("keeps the three mandatory exclusions", async () => {
    await database.pool.query(
      "UPDATE projects SET service_track = 'Tier_3' WHERE id = $1",
      [projectId]
    )

    const id = await addRecord("T3.D1.15a", "draft", {
      ...quote,
      exclusions: [{ exclusion: "No Structural Analysis or FEA included." }],
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })
})
