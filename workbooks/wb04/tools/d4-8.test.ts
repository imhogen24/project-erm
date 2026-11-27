import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"

import {
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
  type ToolRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import {
  lockedBaselineStart,
  lockedBaselineValues,
} from "@/server/team/locked-baseline"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d41 } from "./d4-1"
import { d42 } from "./d4-2"
import { d43 } from "./d4-3"
import { d44 } from "./d4-4"
import { d45 } from "./d4-5"
import { d46 } from "./d4-6"
import { d47 } from "./d4-7"
import { d48 } from "./d4-8"

const database = createTestDatabase()

for (const tool of [d41, d42, d43, d44, d45, d46, d47, d48]) {
  tools.registerTool(tool)
}

registerTestTools({
  wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

loadUnorderedWorkflow({
  wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

let projectId: string

let pm: string

let he: string

let transport: FakeTransport

async function addProject(track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Rice Mill", requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and, but for Client, as company
// roles.
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

    if (role === "Client") {
      continue
    }

    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [rows[0]!.id, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [projectId, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

const roster = {
  roster: [
    { role: "Mid-Level CAD Engineer", engineer: "Kojo Antwi", days: 15 },
    { role: "Junior Technician", engineer: "Efua Mensah", days: 10 },
  ],
}

// Everything before D4.8, with D4.7 locked unless `withMinutes` is false.
async function unblocked(withMinutes = true) {
  for (const toolId of [
    "D1.15",
    "D1.16",
    "D2.1",
    "D2.2",
    "D2.6",
    "D2.12",
    "D2.14",
  ]) {
    await addRecord(toolId)
  }

  await addRecord("D1.14", { totalProjectValue: 94400 })
  await addRecord("D3.10", { authorized: "Yes" })
  await addRecord("D4.1", { targetStartDate: "2027-01-04" })

  for (const toolId of ["D4.2", "D4.4", "D4.5", "D4.6"]) {
    await addRecord(toolId)
  }

  await addRecord("D4.3", roster)

  if (withMinutes) {
    await addRecord("D4.7", { teamClear: "Yes" })
  }
}

async function openD48() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.8"
  )
}

// Three phases from Monday 4 January 2027: three weeks, one and two.
function ready(values: JsonObject = {}): JsonObject {
  return {
    phases: [
      {
        phase: "Phase 1: Conceptual Design & CAD",
        startDate: "2027-01-04",
        endDate: "2027-01-22",
      },
      {
        phase: "Phase 2: Client Review & Iteration",
        startDate: "2027-01-23",
        endDate: "2027-01-29",
      },
      {
        phase: "Phase 3: Prototype Fabrication",
        startDate: "2027-01-30",
        endDate: "2027-02-12",
      },
    ],
    resources: [
      { engineer: "Kojo Antwi", buffer: "Max 2 days overtime" },
      { engineer: "Efua Mensah", buffer: "None" },
    ],
    matchesContract: "Yes",
    ...values,
  }
}

async function draft(values = ready(), before?: ToolRecord) {
  return saveDraft(database, he, {
    projectId,
    toolId: "D4.8",
    cycle: 1,
    values,
    ...(before && { expectedUpdatedAt: before.updatedAt }),
  })
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.message)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  transport = createFakeTransport()
  projectId = await addProject()
  pm = await addPerson("Ama Owusu", ["PM"])
  he = await addPerson("Yaw Asante", ["HE"])
  await addPerson("Kojo Antwi", ["AE"])
  await addPerson("Efua Mensah", ["LD"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("D4.8 locked project baseline", () => {
  it("opens on Tier 1 once D4.7 locks", async () => {
    await unblocked(false)

    expect(await openD48()).toEqual([])

    await addRecord("D4.7", { teamClear: "Yes" })

    expect(await openD48()).toHaveLength(1)
    expect(d48.tier).toBe(1)
  })

  it("lets the HE write it, the PM approve it, and the LE and CR read it", async () => {
    const le = await addPerson("Kwame Boateng", ["LE"])
    const cr = await addPerson("Abena Darko", ["CR"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, he, projectId, "D4.8", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D4.8", "write")).toBe(false)
    expect(await can(database, pm, projectId, "D4.8", "approve")).toBe(true)
    expect(await can(database, le, projectId, "D4.8", "read")).toBe(true)
    expect(await can(database, cr, projectId, "D4.8", "read")).toBe(true)
    expect(await can(database, client, projectId, "D4.8", "read")).toBe(false)
  })

  it("starts on the three phases, 2.1 on D4.1's start date", async () => {
    await unblocked()

    expect(await lockedBaselineStart(database, projectId)).toEqual({
      phases: [
        {
          phase: "Phase 1: Conceptual Design & CAD",
          startDate: "2027-01-04",
        },
        { phase: "Phase 2: Client Review & Iteration" },
        { phase: "Phase 3: Prototype Fabrication" },
      ],
    })
  })

  it("shows D1.14's total and D4.3's roster with each engineer's days", async () => {
    await unblocked()

    const saved = await draft()

    expect(
      await lockedBaselineValues(database, projectId, saved.payload)
    ).toMatchObject({
      totalBudget: "GHS 94,400.00",
      resources: [
        {
          engineer: "Kojo Antwi",
          role: "Mid-Level CAD Engineer",
          days: "15 Days",
          buffer: "Max 2 days overtime",
        },
        {
          engineer: "Efua Mensah",
          role: "Junior Technician",
          days: "10 Days",
          buffer: "None",
        },
      ],
    })
  })

  it("stores only the buffer the HE typed, by engineer", async () => {
    await unblocked()

    const saved = await draft()

    expect(saved.payload.resources).toEqual([
      { engineer: "Kojo Antwi", buffer: "Max 2 days overtime" },
      { engineer: "Efua Mensah", buffer: "None" },
    ])
  })
})

describe("submitting and signing", () => {
  beforeEach(async () => {
    await unblocked()
  })

  it("refuses a missing date, an end before its start, or 4.0 No", async () => {
    const missing = await draft(
      ready({ phases: [{ phase: "Phase 1", startDate: "2027-01-04" }] })
    )

    expect(
      await refusal(submitRecord(database, he, missing.id, transport))
    ).toContain("Required")

    const backwards = await draft(
      ready({
        phases: [
          { phase: "Phase 1", startDate: "2027-01-22", endDate: "2027-01-04" },
        ],
      }),
      missing
    )

    expect(
      await refusal(submitRecord(database, he, backwards.id, transport))
    ).toContain("Must be on or after the start date")

    const no = await draft(ready({ matchesContract: "No" }), backwards)

    expect(
      await refusal(submitRecord(database, he, no.id, transport))
    ).toContain(
      "Answer Yes once the baseline matches the timeline promised in the Contract (D2.12)"
    )
  })

  it("stores each phase's working days, tells the PM, who signs and locks it", async () => {
    const submitted = await submitRecord(
      database,
      he,
      (await draft()).id,
      transport
    )

    expect(submitted.payload.phases).toMatchObject([
      { workingDays: 15 },
      { workingDays: 5 },
      { workingDays: 10 },
    ])

    expect(await listNotifications(database, pm)).not.toEqual([])
    expect(
      transport.sent.some((each) => each.to.includes("ama.owusu@imhogen.test"))
    ).toBe(true)

    const signed = await signField(
      database,
      pm,
      submitted.id,
      "pmSignature",
      transport
    )

    expect(signed.state).toBe("locked")

    const today = new Date().toISOString().slice(0, 10)

    expect(
      await lockedBaselineValues(database, projectId, signed.payload)
    ).toMatchObject({
      lockedBy: "Ama Owusu",
      dateLocked: today,
      signedDate: today,
    })
  })

  it("lets the PM send it back instead", async () => {
    const submitted = await submitRecord(
      database,
      he,
      (await draft()).id,
      transport
    )

    const back = await sendBackRecord(
      database,
      pm,
      submitted.id,
      "Phase 3 runs too long",
      transport
    )

    expect(back.state).toBe("draft")
  })
})
