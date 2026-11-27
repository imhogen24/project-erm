import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { z as zod } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { ANY_AVAILABLE, FULLY_AVAILABLE } from "@/lib/resource-request"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"
import { withPeopleOptions } from "@/server/records/people-options"
import {
  getRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import {
  resourceRequestStart,
  resourceRequestValues,
} from "@/server/team/resource-request"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d41 } from "./d4-1"
import { d42 } from "./d4-2"
import { d43 } from "./d4-3"

const database = createTestDatabase()

tools.registerTool(d41)

tools.registerTool(d42)

tools.registerTool(d43)

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

let le: string

let he: string

let transport: FakeTransport

const today = () => new Date().toISOString().slice(0, 10)

async function addProject(name = "Rice Mill", track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    [name, requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and `company` as company roles.
async function addPerson(
  name: string,
  held: Role[],
  company: Role[] = [],
  on = projectId
) {
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

  for (const role of company) {
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [rows[0]!.id, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(
  toolId: string,
  payload: JsonObject = {},
  on = projectId
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [on, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

const skills = [
  { module: "Mechanical", role: "Mid-Level CAD Engineer", days: 40 },
  { module: "Electronics", role: "Junior Technician", days: 20 },
]

// Everything before D4.2 locked: D1.14's labour, the first milestone's
// D3.10, which opens Workbook 4, and D4.1's two skill rows.
async function unblocked(on = projectId, notes = true) {
  for (const toolId of [
    "D1.15",
    "D1.16",
    "D2.1",
    "D2.2",
    "D2.6",
    "D2.12",
    "D2.14",
  ]) {
    await addRecord(toolId, {}, on)
  }

  await addRecord(
    "D1.14",
    {
      labor: [
        { module: "Mechanical", days: 40, dailyRate: 1000 },
        { module: "Electronics", days: 20, dailyRate: 1000 },
      ],
    },
    on
  )
  await addRecord("D3.10", { authorized: "Yes" }, on)

  if (notes) {
    await addRecord("D4.1", { skills, readyForRequest: "Yes" }, on)
  }
}

async function openD42(on = projectId) {
  return (await availableTools(database, on)).filter(
    (each) => each.toolId === "D4.2"
  )
}

// The LE's D4.2 from the starting values, ready to submit unless `values`
// change it.
async function draft(values: JsonObject = {}) {
  const start = await resourceRequestStart(database, projectId)

  return saveDraft(database, le, {
    projectId,
    toolId: "D4.2",
    cycle: 1,
    values: {
      resourceRequests: z(start.resourceRequests).map((row, index) => ({
        ...row,
        preferredEngineer: index === 0 ? "Fiifi Acquah" : ANY_AVAILABLE,
        dates: "04/01 to 22/01",
      })),
      ...values,
    },
  })
}

const rowsOf = zod.array(zod.record(zod.string(), zod.json())).catch([])

// A table's rows as stored.
function z(value: JsonObject[string] | undefined): JsonObject[] {
  return rowsOf.parse(value)
}

// The HE's answers saved on the submitted record.
async function review(values: JsonObject) {
  const record = await getRecord(database, he, (await current()).id)

  return saveDraft(database, he, {
    projectId,
    toolId: "D4.2",
    cycle: 1,
    values: { ...record.payload, ...values },
    expectedUpdatedAt: record.updatedAt,
  })
}

async function current() {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = 'D4.2' AND state <> 'void'",
    [projectId]
  )

  return rows[0]!
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
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  le = await addPerson("Kojo Antwi", ["LE"], ["LE"])
  he = await addPerson("Kwesi Appiah", ["HE"], ["HE"])
  await addPerson("Ama Owusu", ["PM"], ["PM"])
  await addPerson("Fiifi Acquah", [], ["AE"])
  await addPerson("Akosua Darko", [], ["FO"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("D4.2 resource request form", () => {
  it("opens on Tier 1 once D4.1 locks", async () => {
    await unblocked(projectId, false)

    expect(await openD42()).toEqual([])

    await addRecord("D4.1", { skills })

    expect(await openD42()).toHaveLength(1)
    expect(d42.tier).toBe(1)
  })

  it("lets the LE write it and the HE approve it; others only read", async () => {
    const cr = await addPerson("Emmanuel Quaye", ["CR"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, le, projectId, "D4.2", "write")).toBe(true)
    expect(await can(database, he, projectId, "D4.2", "approve")).toBe(true)
    expect(await can(database, he, projectId, "D4.2", "write")).toBe(false)
    expect(await can(database, cr, projectId, "D4.2", "read")).toBe(true)
    expect(await can(database, cr, projectId, "D4.2", "write")).toBe(false)
    expect(await can(database, fo, projectId, "D4.2", "read")).toBe(false)
  })

  it("starts 2.0 on D4.1's roles and days", async () => {
    await unblocked()

    expect(await resourceRequestStart(database, projectId)).toEqual({
      resourceRequests: [
        { role: "Mid-Level CAD Engineer", days: 40 },
        { role: "Junior Technician", days: 20 },
      ],
    })
  })

  it("lists the engineering staff, then Any available", async () => {
    const shown = await withPeopleOptions(database, d42)
    const table = shown.fields.find((field) => field.key === "resourceRequests")

    const preferred =
      table?.type === "table"
        ? table.columns.find((column) => column.key === "preferredEngineer")
        : undefined

    expect(preferred?.type === "select" && preferred.options).toEqual([
      "Fiifi Acquah",
      "Kojo Antwi",
      "Kwesi Appiah",
      ANY_AVAILABLE,
    ])
  })

  it("shows 1.0 and one 3.0 row per request, with days on other projects", async () => {
    await unblocked()

    const other = await addProject("Solar Dryer")

    // The other project's locked team (D4.3) is what books the engineer;
    // its D4.2 alone does not.
    await addRecord(
      "D4.2",
      {
        resourceRequests: [
          { role: "CAD", preferredEngineer: "Fiifi Acquah", days: 99 },
        ],
        conflictCheck: [{ sn: "3.1", approved: "Yes" }],
      },
      other
    )
    await addRecord(
      "D4.3",
      { roster: [{ role: "CAD", engineer: "Fiifi Acquah", days: 15 }] },
      other
    )

    const record = await draft()

    const values = await resourceRequestValues(database, projectId, record)

    expect(values).toMatchObject({
      requestingPm: "Ama Owusu",
      projectName: "Rice Mill",
      totalBudgetedLabor: "GHS 60,000.00",
      conflictCheck: [
        {
          sn: "3.1",
          requestedEngineer: "Fiifi Acquah",
          utilization: "15 days on Solar Dryer",
        },
        {
          sn: "3.2",
          requestedEngineer: "Junior Technician",
          utilization: "",
        },
      ],
    })
    expect(values).not.toHaveProperty("requestDate")
  })

  it("keeps the HE's fields out of the LE's hands", async () => {
    await unblocked()

    const record = await draft({
      rolesApproved: "Yes",
      conflictCheck: [{ sn: "3.1", approved: "Yes" }],
    })

    expect(record.payload).not.toHaveProperty("rolesApproved")
    expect(record.payload.conflictCheck).toBeUndefined()

    const submitted = await submitRecord(database, le, record.id, transport)

    expect(submitted.state).toBe("submitted")

    expect(await listNotifications(database, he)).not.toEqual([])

    const values = await resourceRequestValues(database, projectId, submitted)

    expect(values.requestDate).toBe(today())
  })

  it("takes only the HE's answers while submitted, and signs once they are given", async () => {
    await unblocked()
    await submitRecord(database, le, (await draft()).id, transport)

    // Signing before answering is refused, on the fields left.
    expect(
      await refusal(
        signField(database, he, (await current()).id, "heSignature")
      )
    ).toContain("Required")

    const answered = await review({
      resourceRequests: [{ role: "Changed by the HE", days: 1 }],
      conflictCheck: [
        { sn: "3.1", approved: "Yes" },
        { sn: "3.2", approved: "No" },
      ],
      rolesApproved: "No",
    })

    expect(answered.payload.resourceRequests).toEqual(
      (await getRecord(database, le, answered.id)).payload.resourceRequests
    )
    expect(z(answered.payload.resourceRequests)[0]?.role).toBe(
      "Mid-Level CAD Engineer"
    )

    expect(
      await refusal(signField(database, he, answered.id, "heSignature"))
    ).toEqual(
      expect.arrayContaining([
        "Name an alternative engineer for a No",
        "Answer Yes once every requested role is filled and approved by Engineering Leadership",
      ])
    )

    await review({
      conflictCheck: [
        { sn: "3.1", approved: "Yes" },
        { sn: "3.2", approved: "No", alternative: "Kojo Antwi" },
      ],
      rolesApproved: "Yes",
    })

    const signed = await signField(
      database,
      he,
      (await current()).id,
      "heSignature",
      transport
    )

    expect(signed.state).toBe("locked")

    const values = await resourceRequestValues(database, projectId, signed)

    expect(values.signedDate).toBe(today())
  })

  it("does not let the LE answer for the HE, nor sign", async () => {
    await unblocked()
    await submitRecord(database, le, (await draft()).id, transport)

    const record = await getRecord(database, le, (await current()).id)

    await expect(
      saveDraft(database, le, {
        projectId,
        toolId: "D4.2",
        cycle: 1,
        values: { ...record.payload, rolesApproved: "Yes" },
        expectedUpdatedAt: record.updatedAt,
      })
    ).rejects.toThrow()

    await expect(
      signField(database, le, (await current()).id, "heSignature")
    ).rejects.toThrow()
  })

  it("keeps the HE's answers when sent back, out of the LE's reach", async () => {
    await unblocked()
    await submitRecord(database, le, (await draft()).id, transport)
    await review({ rolesApproved: "Yes" })

    const back = await sendBackRecord(
      database,
      he,
      (await current()).id,
      "Name the dates",
      transport
    )

    expect(back.state).toBe("draft")

    const saved = await saveDraft(database, le, {
      projectId,
      toolId: "D4.2",
      cycle: 1,
      values: { ...back.payload, rolesApproved: "No" },
      expectedUpdatedAt: back.updatedAt,
    })

    expect(saved.payload.rolesApproved).toBe("Yes")
  })

  it("says an engineer with no other bookings is fully available", async () => {
    await unblocked()

    const values = await resourceRequestValues(
      database,
      projectId,
      await draft()
    )

    expect(z(values.conflictCheck)[0]?.utilization).toBe(FULLY_AVAILABLE)
  })
})
