import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { conclusionQuestions } from "@/lib/risk"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { riskValues } from "@/server/risk/risk"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d110 } from "./d1-10"
import { d111 } from "./d1-11"

const database = createTestDatabase()

tools.registerTool(d110)

tools.registerTool(d111)

loadUnorderedWorkflow({ wb01: ["D1.10", "D1.11"] })

let projectId: string

let le: string

let pm: string

const complete = {
  primaryObjective: "Assess the risks.",
  risks: [
    {
      category: "Timeline",
      description: "Tight.",
      probability: "H",
      impact: "H",
      mitigation: "Phase it.",
    },
  ],
  conclusionQuestions: conclusionQuestions.map((question) => ({
    question,
    status: "No",
    remarks: "Checked",
  })),
  overallRiskProfile: "High, manageable.",
  goNoGoDecision: "Conditional Go",
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
  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("what the system fills in", () => {
  it("names the Lead Engineer and the request, and takes the capability status from D1.10", async () => {
    await addRecord("D1.10", "locked", {
      overallCapabilityStatus: "Partially Capable",
    })

    expect(await riskValues(database, projectId, {})).toMatchObject({
      assessor: "Kojo Antwi",
      requestId: "T1-42",
      overallCapabilityStatus: "Partially Capable",
      assessmentDate: "",
    })
  })
})

describe("submitting and approving D1.11", () => {
  it("the LE signs and submits, and the PM's approval locks it", async () => {
    const id = await addRecord("D1.11", "draft", complete)

    await signField(database, le, id, "assessorSignature")
    await submitRecord(database, le, id)

    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("needs at least one risk, every question and the decision", async () => {
    const id = await addRecord("D1.11", "draft", {
      primaryObjective: "Assess the risks.",
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the Lead Engineer signs", async () => {
    const id = await addRecord("D1.11", "draft", complete)

    await expect(
      signField(database, pm, id, "assessorSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })
})
