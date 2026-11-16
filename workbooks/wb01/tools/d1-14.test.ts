import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { allocationCheck, costCells, costSummary } from "@/lib/cost-estimation"
import { costStart, costValues } from "@/server/cost/cost-estimation"
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

import { d114 } from "./d1-14"

const database = createTestDatabase()

tools.registerTool(d114)

loadUnorderedWorkflow({ wb01: ["D1.14"] })

// GHS 60,000 of labor and 10,000 of direct costs; 15% of the labor, then 7%
// and 15% of both: GHS 94,400 in all, above D1.12's GHS 80,000 floor.
const sheet = {
  labor: [
    { module: "Mechanical", days: 40, dailyRate: 1000 },
    { module: "Electronics", days: 20, dailyRate: 1000 },
  ],
  directCosts: [{ item: "3D Printing Housing", quantity: 2, unitCost: 5000 }],
  markups: [
    { category: "Project Management & QC", rate: 15 },
    { category: "Administrative Overhead", rate: 7 },
    { category: "Sustainability / Risk Margin", rate: 15 },
  ],
  allocations: [
    { deliverable: "CAD", cost: 60000 },
    { deliverable: "Prototype", cost: 34400 },
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

async function submitted(payload: JsonObject = sheet) {
  const id = await addRecord("D1.14", "draft", payload)

  await signField(database, le, id, "leadEngineerSignature")

  return submitRecord(database, le, id)
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', 'T1-42', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id
  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.12", "locked", { costFloor: 80000 })
  await addRecord("D1.13", "locked", {
    includedScope: [
      { category: "CAD", description: "A 3D model." },
      { category: "CAD", description: "Drawings." },
      { category: "Prototype", description: "One unit." },
    ],
  })
})

afterAll(async () => {
  await database.pool.end()
})

describe("the sums", () => {
  it("applies Project Management & QC to the labor, and the other layers to the labor and direct costs", () => {
    const summary = costSummary({ ...sheet, costFloor: 80000 })

    expect(summary.laborTotals).toEqual([40000, 20000])
    expect(summary.laborSubtotal).toBe(60000)
    expect(summary.directSubtotal).toBe(10000)
    expect(summary.markupValues).toEqual([9000, 4900, 10500])
    expect(summary.totalProjectValue).toBe(94400)
    expect(summary.unallocated).toBe(0)
    expect(summary.overheadMet).toBe(true)
  })

  it("says what is left to allocate, or how far over it is", () => {
    const short = costSummary({ ...sheet, allocations: [{ cost: 90000 }] })
    const over = costSummary({ ...sheet, allocations: [{ cost: 100000 }] })

    expect(allocationCheck(short)).toBe("GHS 4,400.00 left to allocate")
    expect(allocationCheck(over)).toBe(
      "GHS 5,600.00 more than the total project value"
    )
  })

  it("shows the totals in the sheet's system cells as the LE types", () => {
    const cells = costCells({ ...sheet, costFloor: "80000" })

    expect(cells.totalProjectValue).toBe("GHS 94,400.00")
    expect(cells.costFloor).toBe("GHS 80,000.00")
    expect(cells.minimumOverheadMet).toBe("Yes")
    expect(cells.allocationCheck).toBe("Balanced with the total project value")
  })

  it("leaves the overhead answer empty until D1.12's floor is known", () => {
    expect(costCells({ ...sheet, costFloor: null }).minimumOverheadMet).toBe("")
  })
})

describe("starting the sheet", () => {
  it("starts 4.0 with each deliverable of D1.13's scope once", async () => {
    expect(await costStart(database, projectId)).toEqual({
      allocations: [{ deliverable: "CAD" }, { deliverable: "Prototype" }],
    })
  })

  it("shows D1.12's cost floor, and D1.15 waits for approval", async () => {
    expect(
      await costValues(database, projectId, { state: "draft", payload: {} })
    ).toEqual({ costFloor: 80000, readyForBriefing: "No, pending approval" })
  })
})

describe("submitting and approving", () => {
  it("stores the totals and that the overhead is met; the PM signs and approves", async () => {
    const record = await submitted()

    expect(record.payload).toMatchObject({
      labor: [{ total: 40000 }, { total: 20000 }],
      markups: [{ value: 9000 }, { value: 4900 }, { value: 10500 }],
      totalProjectValue: 94400,
      costFloor: 80000,
      minimumOverheadMet: true,
    })

    await signField(database, pm, record.id, "financeSignature")

    const locked = await approveRecord(database, pm, record.id)

    expect(locked.state).toBe("locked")
    expect(
      await costValues(database, projectId, {
        state: "locked",
        payload: locked.payload,
      })
    ).toMatchObject({ readyForBriefing: "Yes" })
  })

  it("stores that the overhead is not met below D1.12's floor", async () => {
    const record = await submitted({
      ...sheet,
      labor: [{ module: "Mechanical", days: 10, dailyRate: 1000 }],
      directCosts: [],
      markups: sheet.markups.map((layer) => ({ ...layer, rate: 0 })),
      allocations: [{ deliverable: "CAD", cost: 10000 }],
    })

    expect(record.payload.minimumOverheadMet).toBe(false)
  })

  it("refuses a sheet whose allocations do not add up to the total", async () => {
    const id = await addRecord("D1.14", "draft", {
      ...sheet,
      allocations: [{ deliverable: "CAD", cost: 90000 }],
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      /allocationCheck: The allocations must add up to the total project value, GHS 94,400.00/
    )

    expect((await getRecord(database, le, id)).state).toBe("draft")
  })

  it("needs the labor and the three markup rates", async () => {
    const id = await addRecord("D1.14", "draft", {
      allocations: sheet.allocations,
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the PM signs the Head of R&D / Finance line", async () => {
    const record = await submitted()

    await expect(
      signField(database, le, record.id, "financeSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("the PM cannot approve before signing", async () => {
    const record = await submitted()

    await expect(approveRecord(database, pm, record.id)).rejects.toThrow(
      ValidationError
    )
  })
})
