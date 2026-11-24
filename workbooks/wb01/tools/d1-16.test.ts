import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { handoffChecklist, handoffDirectives } from "@/lib/handoff"
import { handoffStart, handoffValues } from "@/server/handoff/handoff"
import { sourceName } from "@/server/pdf/preview-source"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d115 } from "./d1-15"
import { d116 } from "./d1-16"
import { t3d115a } from "./t3-d1-15a"

const database = createTestDatabase()

for (const each of [d115, t3d115a, d116]) {
  tools.registerTool(each)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

const minutes = {
  meetingDate: "2026-11-20",
  meetingTime: "10:00",
  scopeSummary: "A 3D model and drawings.",
  paymentTerms: "40% advance, 60% handover",
  directives: handoffDirectives.map((each) => ({
    category: each.category,
    directive: "Write it into the contract.",
    source: each.source,
  })),
  checklist: handoffChecklist.map((each) => ({ ...each, status: "Done" })),
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

async function addProject(track: "Tier_1" | "Tier_3") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', 'T1-42', $1) RETURNING id",
    [track]
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', $1, $2, $3)",
    [track, projectId, { organization_name: "Asante Mills" }]
  )

  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
  await addPerson("Gifty Ofori", ["CA"])
}

beforeEach(async () => {
  await resetTestData(database)
  await addProject("Tier_1")
  await addRecord("D1.15", "locked", {
    budget: [
      { value: 60000, paymentSchedule: "40% at signing" },
      { value: 34400, paymentSchedule: "60% at handover" },
    ],
  })
})

afterAll(async () => {
  await database.pool.end()
})

describe("what the system fills", () => {
  it("names who hands off and receives, the client and D1.15's value", async () => {
    expect(await handoffValues(database, projectId)).toEqual({
      requestId: "T1-42",
      leadEngineer: "Kojo Antwi",
      contractAdmin: "Gifty Ofori",
      clientName: "Asante Mills",
      projectValue: "GHS 94,400.00",
    })
  })

  it("starts with D1.15's payment schedules and each directive's source", async () => {
    expect(await handoffStart(database, projectId)).toMatchObject({
      paymentTerms: "40% at signing; 60% at handover",
      directives: [
        { category: "Scope Exclusion", source: "D1.13" },
        { category: "Timeline Risk", source: "D1.11" },
        { category: "Financial Risk", source: "D1.15" },
      ],
      checklist: [
        { assignee: "Contract Admin" },
        { assignee: "Lead Engineer" },
        { assignee: "Contract Admin" },
      ],
    })
  })

  it("on Tier 3 takes the value from T3.D1.15a", async () => {
    await resetTestData(database)
    await addProject("Tier_3")
    await addRecord("T3.D1.15a", "locked", { totalT3ProjectValue: 60000 })

    expect(await handoffValues(database, projectId)).toMatchObject({
      projectValue: "GHS 60,000.00",
    })
    expect(await handoffStart(database, projectId)).toMatchObject({
      paymentTerms: "",
      directives: [{}, {}, { source: "T3.D1.15a" }],
    })
  })
})

describe("the reference brief", () => {
  it("is a PDF preview of D1.15, named as the tool each tier shows", () => {
    const brief = d116.fields.find((each) => each.key === "referenceDocument")

    expect(brief).toMatchObject({
      label: "Reference Document",
      type: "pdfPreview",
      source: { tool: "D1.15" },
    })
    expect(sourceName({ tool: "D1.15" }, "Tier_1")).toBe(
      "D1.15 Project Brief & Draft Budget"
    )
    expect(sourceName({ tool: "D1.15" }, "Tier_3")).toBe(
      "T3.D1.15a T3 Drafting SOW & Quote"
    )
  })

  it("is never filled in by the system", async () => {
    expect(await handoffValues(database, projectId)).not.toHaveProperty(
      "referenceDocument"
    )
  })
})

describe("signing off", () => {
  it("the LE releases and submits, and the PM accepts and approves", async () => {
    const id = await addRecord("D1.16", "draft", minutes)

    await signField(database, le, id, "engineeringRelease")
    await submitRecord(database, le, id)
    await signField(database, pm, id, "contractingAcceptance")

    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("needs a directive for each of the three standard risks", async () => {
    const id = await addRecord("D1.16", "draft", {
      ...minutes,
      directives: minutes.directives.slice(0, 2),
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("needs a status on every checklist task", async () => {
    const id = await addRecord("D1.16", "draft", {
      ...minutes,
      checklist: handoffChecklist.map((each) => ({ ...each })),
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the PM signs the contracting acceptance", async () => {
    const id = await addRecord("D1.16", "draft", minutes)

    await expect(
      signField(database, le, id, "contractingAcceptance")
    ).rejects.toThrow(PermissionDeniedError)
  })
})
