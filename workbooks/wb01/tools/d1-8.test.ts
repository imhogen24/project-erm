import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  clientTechnicalAnswers,
  synthesisValues,
} from "@/server/needs/needs-assessment"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  signField,
  submitRecord,
  transitionRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d17 } from "./d1-7"
import { d18 } from "./d1-8"

const database = createTestDatabase()

tools.registerTool(d17)

tools.registerTool(d18)

loadUnorderedWorkflow({ wb01: ["D1.7", "D1.8"] })

let projectId: string

let le: string

let pm: string

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, 'Tier_1') RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
    [
      rows[0]!.id,
      {
        contact_person: "Kwaku Ampofo",
        email: "kwaku.ampofo@temafoods.test",
        material_inputs: "Carbon steel plate",
        energy_and_information_inputs: "415 V supply, PLC signals",
        outputs: "One boiler skid",
        by_products: "Offcuts",
        human_system: "One operator per shift",
        active_environment: "",
      },
    ]
  )

  return rows[0]!.id
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
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [
      projectId,
      toolId,
      state,
      payload,
      state === "locked" ? "2026-11-18T10:00:00Z" : null,
    ]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
  await addRecord("D1.7", "locked", {})
})

afterAll(async () => {
  await database.pool.end()
})

describe("the client's answers beside 2.0", () => {
  it("names each category the web form answers, and nothing else", async () => {
    expect(await clientTechnicalAnswers(database, projectId)).toEqual({
      "INPUT: Material": "Client: Carbon steel plate",
      "INPUT: Energy": "Client: 415 V supply, PLC signals",
      "INPUT: Information": "Client: 415 V supply, PLC signals",
      "OUTPUT: Material": "Outputs: One boiler skid · By-products: Offcuts",
      "OPERATOR: Human System": "Client: One operator per shift",
    })
  })

  it("never holds the client's contact details", async () => {
    const answers = JSON.stringify(
      await clientTechnicalAnswers(database, projectId)
    )

    expect(answers).not.toContain("Kwaku")
    expect(answers).not.toContain("temafoods")
  })
})

describe("what 1.0 and 4.0 say", () => {
  it("before submitting: the writer, the approved D1.7 and the project, not yet complete", async () => {
    expect(
      await synthesisValues(database, projectId, null, "Kojo Antwi")
    ).toEqual({
      synthesizedBy: "Kojo Antwi",
      synthesisDate: "",
      rawNotesReference: "D1.7 Raw Meeting Notes, approved 18 Nov 2026",
      clientProjectName: "Tema Foods Boiler Skid",
      synthesisComplete: "No",
      readyForReview: "No",
    })
  })

  it("once submitted: who submitted and when, complete, not yet ready", async () => {
    const id = await addRecord("D1.8", "draft", {})

    await signField(database, le, id, "leadEngineerSignature")
    await submitRecord(database, le, id)

    const values = await synthesisValues(database, projectId, {
      id,
      state: "submitted",
    })

    expect(values).toMatchObject({
      synthesizedBy: "Kojo Antwi",
      synthesisComplete: "Yes",
      readyForReview: "No",
    })
    expect(values.synthesisDate).not.toBe("")
  })

  it("once the PM approves: ready for D1.9", async () => {
    const id = await addRecord("D1.8", "draft", {})

    await signField(database, le, id, "leadEngineerSignature")
    await submitRecord(database, le, id)
    await approveRecord(database, pm, id)

    expect(
      await synthesisValues(database, projectId, { id, state: "locked" })
    ).toMatchObject({ synthesisComplete: "Yes", readyForReview: "Yes" })
  })
})

describe("submitting and approving D1.8", () => {
  it("lets the five requirement categories stay empty", async () => {
    const id = await addRecord("D1.8", "draft", {})

    await expect(submitRecord(database, le, id)).resolves.toMatchObject({
      state: "submitted",
    })
  })

  it("needs a requirement and a priority on a row the LE adds", async () => {
    const id = await addRecord("D1.8", "draft", {
      designSpecs: [{ category: "Safety Properties" }],
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("the PM cannot approve it until the Lead Engineer has signed", async () => {
    const id = await addRecord("D1.8", "draft", {})

    await transitionRecord(database, le, id, "submitted")

    await expect(approveRecord(database, pm, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the Lead Engineer signs", async () => {
    const id = await addRecord("D1.8", "draft", {})

    await expect(
      signField(database, pm, id, "leadEngineerSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })
})
