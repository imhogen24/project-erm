import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { DONE, workspaces } from "@/lib/access-log"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"
import {
  approveRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { accessLogValues } from "@/server/team/access-log"
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

tools.registerTool(d41)

tools.registerTool(d42)

tools.registerTool(d43)

tools.registerTool(d44)

tools.registerTool(d45)

tools.registerTool(d46)

tools.registerTool(d47)

tools.registerTool(d48)

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

let he: string

let pm: string

let transport: FakeTransport

const today = () => new Date().toISOString().slice(0, 10)

async function addProject(track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Rice Mill", requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and as company roles.
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

// D4.3 as the HE signed it: three rows naming two engineers.
const assignment: JsonObject = {
  roster: [
    { role: "Mid-Level CAD Engineer", engineer: "Fiifi Acquah", days: 15 },
    { role: "Junior Technician", engineer: "Kojo Antwi", days: 10 },
    { role: "Drafting", engineer: "Fiifi Acquah", days: 3 },
  ],
  engineersLocked: "Yes",
}

// Everything before D4.4, with D4.3 locked unless `withAssignment` is false.
async function unblocked(withAssignment = true) {
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
  await addRecord("D4.1")
  await addRecord("D4.2")

  if (withAssignment) {
    await addRecord("D4.3", assignment)
  }
}

async function openD44() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.4"
  )
}

const allDone = workspaces.map(({ workspace, action }) => ({
  workspace,
  action,
  verified: "Yes",
  status: DONE,
}))

// The HE's D4.4, ready to submit once signed unless `values` change it.
async function draft(values: JsonObject = {}, expectedUpdatedAt?: Date) {
  return saveDraft(database, he, {
    projectId,
    toolId: "D4.4",
    cycle: 1,
    values: {
      accessChecklist: allDone,
      engineersConfirmed: "Yes",
      ...values,
    },
    ...(expectedUpdatedAt && { expectedUpdatedAt }),
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
  he = await addPerson("Kwesi Appiah", ["HE"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("D4.4 access confirmation log", () => {
  it("opens on Tier 1 once D4.3 locks", async () => {
    await unblocked(false)

    expect(await openD44()).toEqual([])

    await addRecord("D4.3", assignment)

    expect(await openD44()).toHaveLength(1)
    expect(d44.tier).toBe(1)
  })

  it("lets the HE write it and the PM approve it; others only read", async () => {
    const le = await addPerson("Kojo Antwi", ["LE"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, he, projectId, "D4.4", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D4.4", "approve")).toBe(true)
    expect(await can(database, pm, projectId, "D4.4", "write")).toBe(false)
    expect(await can(database, le, projectId, "D4.4", "read")).toBe(true)
    expect(await can(database, le, projectId, "D4.4", "write")).toBe(false)
    expect(await can(database, fo, projectId, "D4.4", "read")).toBe(false)
  })

  it("shows 1.0 with the number of engineers on D4.3's roster", async () => {
    await unblocked()

    const values = await accessLogValues(database, projectId, null)

    expect(values).toMatchObject({ teamSize: "2 Engineers" })
    expect(values).not.toHaveProperty("executedBy")
    expect(values).not.toHaveProperty("executedDate")
  })

  it("keeps the four workspaces fixed, with their hints, starting on Pending", () => {
    const checklist = d44.fields.find((each) => each.key === "accessChecklist")

    expect(checklist).toMatchObject({
      fixedRows: [
        {
          workspace: "Google Drive Workspace",
          action: "Create Client Root Folder & Add Team",
        },
        {
          workspace: "CAD Vault / Server",
          action: "Create Project Repo & Grant Read/Write",
        },
        {
          workspace: "Communication Channel",
          action: "Create WhatsApp/Slack Group & Add Team",
        },
        {
          workspace: "QMS Documentation Hub",
          action: "Link this Spoke to the D4 Master Hub",
        },
      ],
      columns: expect.arrayContaining([
        expect.objectContaining({
          key: "verified",
          placeholders: [
            "Link provided?",
            "Permissions verified?",
            "PM made Admin?",
            "Linked?",
          ],
        }),
        expect.objectContaining({ key: "status", startsAs: "Pending" }),
      ]),
    })
  })

  it("refuses to submit with a No, a Pending, 3.0 No or no signature", async () => {
    await unblocked()

    const unsigned = await draft()

    expect(
      await refusal(submitRecord(database, he, unsigned.id, transport))
    ).toContain("Sign as the Head of Engineering before submitting")

    const checks = allDone.map((row, index) =>
      index === 1 ? { ...row, verified: "No" } : row
    )

    const no = await draft(
      {
        accessChecklist: checks.map((row, index) =>
          index === 2 ? { ...row, status: "Pending" } : row
        ),
        engineersConfirmed: "No",
      },
      unsigned.updatedAt
    )

    await signField(database, he, no.id, "adminSignature")

    expect(await refusal(submitRecord(database, he, no.id, transport))).toEqual(
      expect.arrayContaining([
        "Answer every Verification Check Yes before submitting",
        "Mark every workspace Done before submitting",
        "Answer Yes once every assigned engineer has confirmed they can open the shared folders",
      ])
    )
  })

  it("fills in who executed it and tells the PM; the PM approves or sends it back", async () => {
    await unblocked()

    const record = await draft()

    await signField(database, he, record.id, "adminSignature")

    const submitted = await submitRecord(database, he, record.id, transport)

    expect(submitted.state).toBe("submitted")
    expect(await listNotifications(database, pm)).not.toEqual([])
    expect(
      await accessLogValues(database, projectId, {
        id: submitted.id,
        payload: submitted.payload,
      })
    ).toMatchObject({
      executedBy: "Kwesi Appiah",
      executedDate: today(),
      signedDate: today(),
      teamSize: "2 Engineers",
    })

    const back = await sendBackRecord(
      database,
      pm,
      submitted.id,
      "Add the client to the chat group",
      transport
    )

    expect(back.state).toBe("draft")

    await signField(database, he, back.id, "adminSignature")

    const again = await submitRecord(database, he, back.id, transport)

    expect((await approveRecord(database, pm, again.id)).state).toBe("locked")
  })
})
