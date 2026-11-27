import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { ANY_AVAILABLE } from "@/lib/resource-request"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"
import {
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { engineerBookings } from "@/server/team/resource-request"
import {
  assignmentStart,
  assignmentValues,
} from "@/server/team/team-assignment"
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
import { t3d48a } from "./t3-d4-8a"

const database = createTestDatabase()

tools.registerTool(d41)

tools.registerTool(d42)

tools.registerTool(d43)

tools.registerTool(d44)

tools.registerTool(d45)

tools.registerTool(d46)

tools.registerTool(d47)

tools.registerTool(d48)

tools.registerTool(t3d48a)

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

let projectId: string

let le: string

let he: string

let fiifi: string

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
async function addPerson(name: string, held: Role[], company: Role[] = []) {
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

// D4.2 as the HE approved it: Fiifi for the CAD role, anyone free for the
// technician, given to Kojo, and a third row answered No with no one named.
const request: JsonObject = {
  resourceRequests: [
    {
      role: "Mid-Level CAD Engineer",
      preferredEngineer: "Fiifi Acquah",
      days: 15,
    },
    { role: "Junior Technician", preferredEngineer: ANY_AVAILABLE, days: 10 },
    { role: "Draftsperson", days: 3 },
  ],
  conflictCheck: [
    { sn: "3.1", approved: "Yes" },
    { sn: "3.2", approved: "No", alternative: "Kojo Antwi" },
    { sn: "3.3", approved: "Yes" },
  ],
  rolesApproved: "Yes",
}

const notes = {
  skills: [{ role: "Mid-Level CAD Engineer", days: 40 }],
  resources: [
    { category: "Software License", tool: "Autodesk Inventor 2025" },
    { category: "Specialized Equipment", tool: "" },
    { category: "Testing Apparatus", tool: "Thermal Camera" },
  ],
}

// Everything before D4.3, with D4.2 locked unless `withRequest` is false.
async function unblocked(withRequest = true) {
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

  await addRecord("D3.10", { authorized: "Yes" })
  await addRecord("D4.1", notes)

  if (withRequest) {
    await addRecord("D4.2", request)
  }
}

async function openD43() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.3"
  )
}

// The LE's D4.3: two rostered engineers, ready to submit unless `values`
// change it.
async function draft(values: JsonObject = {}) {
  return saveDraft(database, le, {
    projectId,
    toolId: "D4.3",
    cycle: 1,
    values: {
      roster: [
        {
          role: "Mid-Level CAD Engineer",
          engineer: "Fiifi Acquah",
          days: 15,
          phases: "All Phases",
        },
        { role: "Junior Technician", engineer: "Kojo Antwi", days: 10 },
      ],
      provisioning: [
        {
          engineer: "Fiifi Acquah",
          asset: "Autodesk Inventor 2025",
          status: "Pending",
        },
      ],
      engineersLocked: "Yes",
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

async function rolesOf(personId: string) {
  const { rows } = await database.pool.query<{ role: string }>(
    "SELECT role FROM person_project_roles WHERE person_id = $1 AND project_id = $2 ORDER BY role",
    [personId, projectId]
  )

  return rows.map((row) => row.role)
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
  fiifi = await addPerson("Fiifi Acquah", [], ["AE"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("D4.3 team assignment and provisioning record", () => {
  it("opens on Tier 1 once D4.2 locks", async () => {
    await unblocked(false)

    expect(await openD43()).toEqual([])

    await addRecord("D4.2", request)

    expect(await openD43()).toHaveLength(1)
    expect(d43.tier).toBe(1)
  })

  it("lets the LE write it and the HE approve it; others only read", async () => {
    const cr = await addPerson("Emmanuel Quaye", ["CR"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, le, projectId, "D4.3", "write")).toBe(true)
    expect(await can(database, he, projectId, "D4.3", "approve")).toBe(true)
    expect(await can(database, he, projectId, "D4.3", "write")).toBe(false)
    expect(await can(database, cr, projectId, "D4.3", "read")).toBe(true)
    expect(await can(database, cr, projectId, "D4.3", "write")).toBe(false)
    expect(await can(database, fo, projectId, "D4.3", "read")).toBe(false)
  })

  it("starts 2.0 on D4.2's settled engineers and 3.0 on D4.1's tools", async () => {
    await unblocked()

    expect(await assignmentStart(database, projectId)).toEqual({
      roster: [
        { role: "Mid-Level CAD Engineer", engineer: "Fiifi Acquah", days: 15 },
        { role: "Junior Technician", engineer: "Kojo Antwi", days: 10 },
        { role: "Draftsperson", days: 3 },
      ],
      provisioning: [
        { asset: "Autodesk Inventor 2025" },
        { asset: "Thermal Camera" },
      ],
    })
  })

  it("shows 1.0, and the day the HE signed once signed", async () => {
    await unblocked()

    expect(await assignmentValues(database, projectId, {})).toMatchObject({
      projectManager: "Ama Owusu",
      projectName: "Rice Mill",
    })
    expect(await assignmentValues(database, projectId, {})).not.toHaveProperty(
      "assignmentDate"
    )
  })

  it("refuses to submit with an engineer missing or 4.0 No", async () => {
    await unblocked()

    const empty = await draft({
      roster: [{ role: "CAD", days: 5 }],
    })

    expect(
      await refusal(submitRecord(database, le, empty.id, transport))
    ).toContain("Required")

    const no = await saveDraft(database, le, {
      projectId,
      toolId: "D4.3",
      cycle: 1,
      values: {
        roster: [{ role: "CAD", engineer: "Fiifi Acquah", days: 5 }],
        engineersLocked: "No",
      },
      expectedUpdatedAt: empty.updatedAt,
    })

    expect(
      await refusal(submitRecord(database, le, no.id, transport))
    ).toContain(
      "Answer Yes once every engineer is officially locked in the Master Capacity Tracker (D4 Hub)"
    )
  })

  it("adds each rostered engineer not on the project as AE when the HE signs", async () => {
    await unblocked()

    const submitted = await submitRecord(
      database,
      le,
      (await draft()).id,
      transport
    )

    expect(await listNotifications(database, he)).not.toEqual([])
    expect(await rolesOf(fiifi)).toEqual([])

    const signed = await signField(
      database,
      he,
      submitted.id,
      "heSignature",
      transport
    )

    expect(signed.state).toBe("locked")

    // Fiifi joins as AE and is told; Kojo, already the LE, is left as he is.
    expect(await rolesOf(fiifi)).toEqual(["AE"])
    expect(await rolesOf(le)).toEqual(["LE"])

    expect(
      (await listNotifications(database, fiifi)).map((each) => each.title)
    ).toContain("You were assigned as AE on Rice Mill")
    expect(
      transport.sent.some((each) =>
        each.to.includes("fiifi.acquah@imhogen.test")
      )
    ).toBe(true)

    const { rows } = await database.pool.query<{ roles: string }>(
      "SELECT roles::text AS roles FROM access_log WHERE person_id = $1 AND action = 'roles_added'",
      [fiifi]
    )

    expect(rows.map((row) => row.roles)).toEqual(["{AE}"])

    const values = await assignmentValues(database, projectId, signed.payload)

    expect(values).toMatchObject({
      assignmentDate: today(),
      signedDate: today(),
    })
  })

  it("lets the HE send it back instead, adding no one", async () => {
    await unblocked()

    const submitted = await submitRecord(
      database,
      le,
      (await draft()).id,
      transport
    )

    const back = await sendBackRecord(
      database,
      he,
      submitted.id,
      "Fewer days for the technician",
      transport
    )

    expect(back.state).toBe("draft")
    expect(await rolesOf(fiifi)).toEqual([])
  })

  it("books its roster's days for other projects' D4.2", async () => {
    await unblocked()
    await addRecord("D4.3", {
      roster: [{ role: "CAD", engineer: "Fiifi Acquah", days: 15 }],
    })

    const other = await addProject("Solar Dryer")

    expect(
      (await engineerBookings(database, other)).get("Fiifi Acquah")
    ).toEqual([{ project: "Rice Mill", days: 15 }])
    expect(await engineerBookings(database, projectId)).toEqual(new Map())
  })
})
