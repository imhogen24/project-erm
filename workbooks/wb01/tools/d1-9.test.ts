import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role, ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  submitRecord,
} from "@/server/records/records"
import { reviewDirectives } from "@/lib/internal-review"
import { reviewValues } from "@/server/review/internal-review"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d13 } from "./d1-3"
import { d18 } from "./d1-8"
import { d19 } from "./d1-9"
import { t3d13a } from "./t3-d1-3a"
import { t3d18a } from "./t3-d1-8a"

const database = createTestDatabase()

for (const tool of [d13, d18, d19, t3d13a, t3d18a]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({
  wb01: ["D1.3", "D1.8", "T3.D1.3a", "T3.D1.8a", "D1.9"],
})

let projectId: string

let om: string

let he: string

const complete = {
  primaryObjective: "Check the request is realistic.",
  priority: "High",
  reviews: reviewDirectives.map((each) => ({ ...each, status: "Passed" })),
}

async function addProject(track: ServiceTrack = "Tier_1") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, $2) RETURNING id",
    [`T-${crypto.randomUUID()}`, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
    [
      rows[0]!.id,
      {
        organization_name: "Tema Foods Ltd",
        project_title: "Packaged boiler skid",
        target_timeline: "12 weeks",
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
    "INSERT INTO tool_records (project_id, tool_id, state, payload, submitted_at) VALUES ($1, $2, $3, $4, '2026-11-09T10:00:00Z') RETURNING id",
    [projectId, toolId, state, payload]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  om = await addPerson("Kwabena Asante", ["OM"])
  he = await addPerson("Kwesi Appiah", ["HE"])
  await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("what the system fills in", () => {
  it("names the PM, the client, the synthesis date, the timeline and the project", async () => {
    await addRecord("D1.8", "locked", {})

    expect(await reviewValues(database, projectId)).toMatchObject({
      requestedBy: "Ama Owusu",
      clientName: "Tema Foods Ltd",
      synthesisDate: "9 Nov 2026",
      requiredCompletion: "12 weeks",
      projectTitle: "Packaged boiler skid",
    })
  })

  it("lists D1.3, D1.8 and the client's uploads on Tier 1, with their state", async () => {
    await addRecord("D1.3", "locked", {})

    const values = await reviewValues(database, projectId)

    expect(values.referenceMaterial).toEqual([
      {
        document: "D1.3 Received Request Record",
        link: `/projects/${projectId}/tools/D1.3`,
        status: "Locked",
      },
      {
        document: "D1.8 Needs Assessment Notes",
        link: `/projects/${projectId}/tools/D1.8`,
        status: "Not started",
      },
      {
        document: "Client Supplementary Uploads (D1.1)",
        link: `/projects/${projectId}/tools/D1.1`,
        status: "Not started",
      },
    ])
  })

  it("lists the Tier 3 intake and measurements on a Tier 3 project", async () => {
    projectId = await addProject("Tier_3")

    const values = await reviewValues(database, projectId)

    expect(JSON.stringify(values.referenceMaterial)).toContain("T3.D1.3a")
    expect(JSON.stringify(values.referenceMaterial)).toContain("T3.D1.8a")
  })
})

describe("submitting and approving D1.9", () => {
  it("the OM submits and the HE's approval locks it", async () => {
    const id = await addRecord("D1.9", "draft", complete)

    await submitRecord(database, om, id)

    expect((await approveRecord(database, he, id)).state).toBe("locked")
  })

  it("needs the objective, the priority and every review's reviewer, focus and status", async () => {
    const id = await addRecord("D1.9", "draft", {
      reviews: complete.reviews.map(({ category }) => ({ category })),
    })

    await expect(submitRecord(database, om, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the HE approves it", async () => {
    const id = await addRecord("D1.9", "draft", complete)

    await submitRecord(database, om, id)

    const pm = await addPerson("Efua Quartey", ["PM"])

    await expect(approveRecord(database, pm, id)).rejects.toThrow(
      PermissionDeniedError
    )
  })
})
