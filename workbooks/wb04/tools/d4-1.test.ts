import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { resourceCategories } from "@/lib/technical-notes"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"
import {
  getRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import {
  technicalNotesStart,
  technicalNotesValues,
} from "@/server/team/technical-notes"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d41 } from "./d4-1"

const database = createTestDatabase()

tools.registerTool(d41)

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

let pm: string

let transport: FakeTransport

const today = () => new Date().toISOString().slice(0, 10)

async function addProject(track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [requestId, track, rows[0]!.id, { organization_name: "Asante Mills" }]
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
  on = projectId
) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [on, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

// Everything D4.1 reads locked: D1.14's two modules, D2.14's start date and
// the first milestone's D3.10, which opens Workbook 4.
async function unblocked(on = projectId) {
  for (const toolId of ["D1.15", "D1.16", "D2.1", "D2.2", "D2.6", "D2.12"]) {
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
  await addRecord("D2.14", { startDate: "2026-12-21" }, on)
  await addRecord("D3.10", { authorized: "Yes" }, on)
}

async function openD41(on = projectId) {
  return (await availableTools(database, on)).filter(
    (each) => each.toolId === "D4.1"
  )
}

const filledSkills = [
  {
    module: "Mechanical",
    role: "Mid-Level CAD Engineer",
    days: 40,
    notes: "Must be prolific in Autodesk Inventor",
  },
  {
    module: "Electronics",
    role: "Junior Technician",
    days: 20,
    notes: "3D printing and basic soldering skills needed",
  },
]

const filledResources = resourceCategories.map((category) => ({
  category,
  tool: "Autodesk Inventor 2025",
  duration: "15 Days",
  status: "Available",
}))

// The LE's D4.1 from the starting values, ready to submit unless `values`
// change it.
async function draft(values: JsonObject = {}) {
  const start = await technicalNotesStart(database, projectId)

  return saveDraft(database, le, {
    projectId,
    toolId: "D4.1",
    cycle: 1,
    values: {
      ...start,
      skills: filledSkills,
      resources: filledResources,
      readyForRequest: "Yes",
      ...values,
    },
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
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  le = await addPerson("Kofi Asare", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("opening", () => {
  it("opens with Workbook 4 once D3.10 locks, on Tier 1 only", async () => {
    expect(await openD41()).toEqual([])

    await unblocked()

    expect(await openD41()).toEqual([{ toolId: "D4.1", cycle: 1 }])

    const tier3 = await addProject("Tier_3")

    await unblocked(tier3)

    expect(await openD41(tier3)).toEqual([])
  })
})

describe("starting values", () => {
  it("starts on D2.14's start date and one row per D1.14 module with its days", async () => {
    await unblocked()

    expect(await technicalNotesStart(database, projectId)).toEqual({
      targetStartDate: "2026-12-21",
      skills: [
        { module: "Mechanical", days: 40 },
        { module: "Electronics", days: 20 },
      ],
    })
  })

  it("shows the PM and the project, and says when the dates fill in", async () => {
    await unblocked()

    const values = await technicalNotesValues(database, projectId, null)

    expect(values.projectManager).toBe("Ama Owusu")
    expect(values.requestId).toMatch(/^Tier_1-/)
    expect(values).not.toHaveProperty("breakdownDate")
    expect(values).not.toHaveProperty("signedDate")
  })
})

describe("submitting", () => {
  it("is refused until the breakdown is answered Yes", async () => {
    await unblocked()

    const record = await draft({ readyForRequest: "No" })

    expect(await refusal(submitRecord(database, le, record.id))).toEqual([
      "Answer Yes once the technical breakdown is complete and ready for the Resource Request (D4.2)",
    ])
  })

  it("keeps the three fixed categories, takes added rows, fills in the breakdown date and tells the PM", async () => {
    await unblocked()

    const record = await draft({
      resources: [
        ...filledResources,
        {
          category: "Consumables",
          tool: "Solder wire",
          duration: "2 Days",
          status: "Needs Procurement",
        },
      ],
    })

    const submitted = await submitRecord(database, le, record.id, transport)

    expect(submitted.state).toBe("submitted")
    expect(submitted.payload.resources).toMatchObject([
      ...resourceCategories.map((category) => ({ category })),
      { category: "Consumables" },
    ])
    expect(
      (await technicalNotesValues(database, projectId, submitted)).breakdownDate
    ).toBe(today())
    expect(await listNotifications(database, pm)).not.toEqual([])
  })
})

describe("signing", () => {
  it("approves and locks it as the PM signs, filling in the Date", async () => {
    await unblocked()

    const record = await draft()

    await submitRecord(database, le, record.id)
    await signField(database, pm, record.id, "pmSignature", transport)

    const locked = await getRecord(database, pm, record.id)

    expect(locked.state).toBe("locked")
    expect(
      (await technicalNotesValues(database, projectId, locked)).signedDate
    ).toBe(today())
  })

  it("goes back to the LE when the PM sends it back, to change and submit again", async () => {
    await unblocked()

    const record = await draft()

    await submitRecord(database, le, record.id)
    await sendBackRecord(database, pm, record.id, "Name the CAD software")

    const back = await getRecord(database, le, record.id)

    expect(back.state).toBe("draft")

    await updateRecord(database, le, record.id, {
      ...back.payload,
      skills: [{ ...filledSkills[0]!, role: "Senior CAD Engineer" }],
    })

    expect((await submitRecord(database, le, record.id)).state).toBe(
      "submitted"
    )
  })
})

describe("who sees it", () => {
  it("lets the LE write it, the PM approve it, the OM, AE, HE and CR read it, and nobody else see it", async () => {
    const readers = [
      await addPerson("Yaa Mensah", ["OM"]),
      await addPerson("Kwame Ofori", ["AE"]),
      await addPerson("Kojo Mensah", ["HE"]),
      await addPerson("Yaw Boateng", ["CR"]),
    ]

    const fo = await addPerson("Esi Badu", ["FO"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])

    await unblocked()

    expect(await can(database, le, projectId, "D4.1", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D4.1", "approve")).toBe(true)
    expect(await can(database, pm, projectId, "D4.1", "write")).toBe(false)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D4.1", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D4.1", "write")).toBe(
        false
      )
    }

    for (const outsider of [fo, client]) {
      expect(await can(database, outsider, projectId, "D4.1", "read")).toBe(
        false
      )
    }
  })
})
