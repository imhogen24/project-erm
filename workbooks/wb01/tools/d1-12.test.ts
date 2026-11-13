import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { capabilityDomains } from "@/lib/feasibility"
import {
  feasibilityStart,
  feasibilityValues,
} from "@/server/feasibility/feasibility"
import {
  ValidationError,
  approveRecord,
  getRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d110 } from "./d1-10"
import { d111 } from "./d1-11"
import { d112 } from "./d1-12"

const database = createTestDatabase()

for (const tool of [d110, d111, d112]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.10", "D1.11", "D1.12"] })

let projectId: string

let le: string

let pm: string

let client: string

const complete = {
  capability: capabilityDomains.map((domain) => ({
    domain,
    status: "Partial",
    findings: "Checked",
  })),
  criticalRisks: [
    { risk: "Timeline", impact: "High", mitigation: "Phase it." },
  ],
  realisticTimeline: "8 weeks",
  costFloor: 80000,
  commercialNotes: "About 8 weeks.",
  recommendation: "Feasible with a revised scope.",
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
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', 'T1-42', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', 'Tier_1', $1, $2)",
    [projectId, { target_timeline: "2 weeks" }]
  )

  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
  client = await addPerson("Kwaku Ampofo", ["Client"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("what the system fills in", () => {
  it("takes the client's timeline, and says the budget was not provided", async () => {
    await addRecord("D1.10", "locked", {
      overallCapabilityStatus: "Partially Capable",
    })

    expect(await feasibilityValues(database, projectId, {})).toMatchObject({
      assessor: "Kojo Antwi",
      overallCapabilityStatus: "Partially Capable",
      clientTimeline: "2 weeks",
      clientBudget: "Not provided",
    })
  })

  it("starts the critical risks from D1.11's register", async () => {
    await addRecord("D1.11", "locked", {
      risks: [
        {
          category: "Timeline",
          description: "Two weeks is too short.",
          probability: "H",
          impact: "M",
          mitigation: "Phase the schedule.",
        },
      ],
    })

    expect(await feasibilityStart(database, projectId)).toEqual({
      criticalRisks: [
        {
          risk: "Timeline: Two weeks is too short.",
          impact: "Medium",
          mitigation: "Phase the schedule.",
        },
      ],
    })
  })
})

describe("submitting, approving and who reads D1.12", () => {
  it("the LE signs and submits, and the PM's approval locks it", async () => {
    const id = await addRecord("D1.12", "draft", complete)

    await signField(database, le, id, "assessorSignature")
    await submitRecord(database, le, id)

    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("needs every domain assessed, a risk, the timeline, cost floor and recommendation", async () => {
    const id = await addRecord("D1.12", "draft", {})

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("the client reads nothing until the PM approves", async () => {
    const id = await addRecord("D1.12", "draft", complete)

    expect((await getRecord(database, client, id)).payload).toEqual({})

    await signField(database, le, id, "assessorSignature")
    await submitRecord(database, le, id)
    await approveRecord(database, pm, id)

    expect((await getRecord(database, client, id)).payload).toMatchObject({
      recommendation: "Feasible with a revised scope.",
    })
  })
})
