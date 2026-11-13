import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { commercialCriteria, technicalCriteria } from "@/lib/capability"
import { capabilityValues } from "@/server/capability/capability"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d110 } from "./d1-10"

const database = createTestDatabase()

tools.registerTool(d110)

loadUnorderedWorkflow({ wb01: ["D1.10"] })

let projectId: string

let le: string

let pm: string

const answered = (criteria: string[]) =>
  criteria.map((criterion) => ({
    criterion,
    status: "Yes",
    justification: "Checked",
  }))

const complete = {
  technicalCapability: answered(technicalCriteria),
  commercialAlignment: answered(commercialCriteria),
  overallCapabilityStatus: "Partially Capable",
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

async function addRecord(payload: JsonObject) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.10', 'draft', $2) RETURNING id",
    [projectId, payload]
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
    [
      projectId,
      {
        organization_name: "Tema Foods Ltd",
        project_title: "Packaged boiler skid",
      },
    ]
  )

  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("what the system fills in", () => {
  it("names the Lead Engineer, the client, the project and its request ID", async () => {
    expect(await capabilityValues(database, projectId, {})).toEqual({
      assessor: "Kojo Antwi",
      clientName: "Tema Foods Ltd",
      projectTitle: "Packaged boiler skid",
      requestId: "T1-42",
      assessmentDate: "",
    })
  })

  it("dates the assessment when the Lead Engineer signs", async () => {
    const values = await capabilityValues(database, projectId, {
      assessorSignature: {
        signedBy: le,
        signedAt: "2026-11-20T10:00:00.000Z",
      },
    })

    expect(values.assessmentDate).toBe("20 Nov 2026")
  })
})

describe("submitting and approving D1.10", () => {
  it("the LE signs and submits, and the PM's approval locks it", async () => {
    const id = await addRecord(complete)

    await signField(database, le, id, "assessorSignature")
    await submitRecord(database, le, id)

    expect((await approveRecord(database, pm, id)).state).toBe("locked")
  })

  it("needs every fixed criterion answered and the conclusion", async () => {
    const id = await addRecord({
      technicalCapability: technicalCriteria.map((criterion) => ({
        criterion,
      })),
    })

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the Lead Engineer signs", async () => {
    const id = await addRecord(complete)

    await expect(
      signField(database, pm, id, "assessorSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })
})
