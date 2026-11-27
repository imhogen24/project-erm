import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { digitalAssets, technicalBaseline } from "@/lib/drafting-assignment"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { previewSourcesOf } from "@/server/pdf/previews"
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
  draftingAssignmentStart,
  draftingAssignmentValues,
} from "@/server/team/drafting-assignment"
import { defineTool } from "@/server/tools/define-tool"
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

for (const tool of [d41, d42, d43, d44, d45, d46, d47, d48, t3d48a]) {
  tools.registerTool(tool)
}

const before = {
  wb01: ["D1.1", "T3.D1.3a", "D1.14", "D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "T3.D2.2a", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
}

registerTestTools(before)

loadUnorderedWorkflow(before)

let projectId: string

let pm: string

let ae: string

let transport: FakeTransport

async function addProject(track: string) {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Bracket Drawings", requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and as company roles.
async function addPerson(name: string, held: Role[], onProject = true) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@imhogen.test`]
  )

  for (const role of held) {
    if (onProject) {
      await database.pool.query(
        "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
        [rows[0]!.id, projectId, role]
      )
    }

    if (role !== "Client") {
      await database.pool.query(
        "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
        [rows[0]!.id, role]
      )
    }
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [projectId, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

// Everything before Workbook 4, with D3.10 locked unless `opened` is false.
async function unblocked(opened = true) {
  for (const toolId of [...before.wb01, ...before.wb02]) {
    if (toolId === "T3.D1.3a" || toolId === "T3.D1.15a") {
      continue
    }

    await addRecord(toolId)
  }

  await addRecord("T3.D1.3a", {
    draftingSpecs: [
      { standard: "ISO", toleranceClass: "General", fileFormat: "STEP" },
      { standard: "ISO", toleranceClass: "Fine", fileFormat: "PDF" },
    ],
  })

  await addRecord("T3.D1.15a", {
    deliverables: [{ timeline: "3 Days" }, { timeline: "1 week" }],
  })

  if (opened) {
    await addRecord("D3.10", { authorized: "Yes" })
  }
}

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

// 2.0's rows holding these statuses, in order.
function access(statuses: string[]) {
  return digitalAssets.map((asset, index) => ({
    resource: asset.resource,
    status: statuses[index]!,
  }))
}

function ready(values: JsonObject = {}): JsonObject {
  return {
    roster: [
      {
        engineer: "Kojo Antwi",
        skillset: "3D Modeling/Surfacing",
        allocatedHours: "16 Hrs",
        startDate: "2027-01-04",
        targetDate: "2027-01-11",
      },
      {
        engineer: "Efua Mensah",
        startDate: "2027-01-04",
        targetDate: "2027-01-11",
      },
    ],
    digitalAccess: access(["Ready", "Created", "Verified"]),
    technicalBaseline: technicalBaseline.map((row, index) => ({
      parameter: row.parameter,
      reference: row.reference,
      requirement: ["ISO", "General", "STEP"][index]!,
    })),
    ...values,
  }
}

async function draft(values = ready(), earlier?: ToolRecord) {
  return saveDraft(database, ae, {
    projectId,
    toolId: "T3.D4.8a",
    cycle: 1,
    values,
    ...(earlier && { expectedUpdatedAt: earlier.updatedAt }),
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
  projectId = await addProject("Tier_3")
  pm = await addPerson("Ama Owusu", ["PM"])
  ae = await addPerson("Kojo Antwi", ["AE"])
  // An engineer on no role of the project yet.
  await addPerson("Efua Mensah", ["LD"], false)
})

afterAll(async () => {
  await database.pool.end()
})

describe("T3.D4.8a drafting assignment and baseline", () => {
  it("opens on Tier 3 with Workbook 4, and no D4.1 to D4.8 show", async () => {
    await unblocked(false)

    expect(await openTools()).not.toContain("T3.D4.8a")

    await addRecord("D3.10", { authorized: "Yes" })

    const open = await openTools()

    expect(open).toContain("T3.D4.8a")
    expect(open.filter((toolId) => toolId.startsWith("D4."))).toEqual([])
  })

  it("never opens on Tier 1", async () => {
    projectId = await addProject("Tier_1")
    await unblocked()

    expect(await openTools()).not.toContain("T3.D4.8a")
  })

  it("lets the AE write it, the PM approve it, the others read it, and not the client", async () => {
    const he = await addPerson("Yaw Asante", ["HE"])
    const cr = await addPerson("Abena Darko", ["CR"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, ae, projectId, "T3.D4.8a", "write")).toBe(true)
    expect(await can(database, pm, projectId, "T3.D4.8a", "write")).toBe(false)
    expect(await can(database, pm, projectId, "T3.D4.8a", "approve")).toBe(true)
    expect(await can(database, he, projectId, "T3.D4.8a", "read")).toBe(true)
    expect(await can(database, cr, projectId, "T3.D4.8a", "read")).toBe(true)
    expect(await can(database, client, projectId, "T3.D4.8a", "read")).toBe(
      false
    )
  })

  it("starts 1.1 on the AE and 3.0 on T3.D1.3a's specifications", async () => {
    await unblocked()

    expect(
      await draftingAssignmentStart(database, projectId, "Kojo Antwi")
    ).toEqual({
      roster: [{ engineer: "Kojo Antwi" }],
      technicalBaseline: [
        { requirement: "ISO" },
        { requirement: "General, Fine" },
        { requirement: "STEP, PDF" },
      ],
    })
  })

  it("shows T3.D1.15a's longest timeline for the target dates to follow", async () => {
    await unblocked()

    expect(
      await draftingAssignmentValues(database, projectId, {})
    ).toMatchObject({ deliveryTimeline: "1 week" })
  })

  it("previews the client's files in 2.1 and offers each row its own statuses", () => {
    const access = t3d48a.fields.find((each) => each.key === "digitalAccess")

    expect(previewSourcesOf(t3d48a)).toEqual([
      ["digitalAccess.0.link", { tool: "D1.1" }],
    ])
    expect(
      access?.type === "table" &&
        access.columns.find((each) => each.key === "status")
    ).toMatchObject({
      rowOptions: [
        ["Ready", "Missing"],
        ["Created", "Pending"],
        ["Verified", "Pending"],
      ],
    })
  })
})

describe("submitting and signing", () => {
  beforeEach(async () => {
    await unblocked()
  })

  it("refuses 2.0 short of Ready, Created and Verified", async () => {
    const pending = await draft(
      ready({
        digitalAccess: access(["Missing", "Created", "Pending"]),
      })
    )

    await signField(database, ae, pending.id, "aeSignature", transport)

    const messages = await refusal(
      submitRecord(database, ae, pending.id, transport)
    )

    expect(messages).toContain(
      "Client Source Data must read Ready before submitting"
    )
    expect(messages).toContain(
      "Software License must read Verified before submitting"
    )
    expect(messages).not.toContain(
      "Project CAD Folder must read Created before submitting"
    )
  })

  it("refuses a record the AE has not signed", async () => {
    const unsigned = await draft()

    expect(
      await refusal(submitRecord(database, ae, unsigned.id, transport))
    ).toContain("Sign as the Assigned Engineer before submitting")
  })

  it("tells the PM, who signs and locks it, and adds engineers as AE", async () => {
    const drafted = await draft()

    await signField(database, ae, drafted.id, "aeSignature", transport)

    const submitted = await submitRecord(database, ae, drafted.id, transport)

    expect(await listNotifications(database, pm)).not.toEqual([])

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
      await draftingAssignmentValues(database, projectId, signed.payload)
    ).toMatchObject({ pmSignedDate: today, aeSignedDate: today })

    const { rows } = await database.pool.query<{ role: string }>(
      "SELECT ppr.role FROM person_project_roles ppr JOIN people p ON p.id = ppr.person_id WHERE ppr.project_id = $1 AND p.name = 'Efua Mensah'",
      [projectId]
    )

    expect(rows.map((row) => row.role)).toEqual(["AE"])
  })

  it("lets the PM send it back instead", async () => {
    const drafted = await draft()

    await signField(database, ae, drafted.id, "aeSignature", transport)

    const submitted = await submitRecord(database, ae, drafted.id, transport)

    const back = await sendBackRecord(
      database,
      pm,
      submitted.id,
      "Allocate more hours",
      transport
    )

    expect(back.state).toBe("draft")
  })
})

describe("the new column options", () => {
  const base = {
    id: "X.1",
    name: "Example",
    workbook: "wb04",
  }

  it("refuses row options a select does not hold", () => {
    expect(() =>
      defineTool({
        ...base,
        fields: [
          {
            key: "rows",
            label: "Rows",
            type: "table",
            fixedRows: [{ name: "A" }],
            columns: [
              { key: "name", label: "Name", type: "text" },
              {
                key: "status",
                label: "Status",
                type: "select",
                options: ["Ready"],
                rowOptions: [["Missing"]],
              },
            ],
          },
        ],
      })
    ).toThrow()
  })

  it("refuses a following date with no duration field", () => {
    expect(() =>
      defineTool({
        ...base,
        fields: [
          {
            key: "rows",
            label: "Rows",
            type: "table",
            columns: [
              { key: "start", label: "Start", type: "date" },
              {
                key: "end",
                label: "End",
                type: "date",
                followsInRow: { column: "start", plusDurationOf: "missing" },
              },
            ],
          },
        ],
      })
    ).toThrow()
  })
})
