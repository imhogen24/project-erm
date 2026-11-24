import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { placeholdersIn } from "@/lib/placeholders"
import { standardClauses } from "@/lib/standard-contract"
import {
  contractFills,
  contractStart,
} from "@/server/contract/standard-contract"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { fillsOf } from "@/server/records/fills"
import {
  ValidationError,
  getRecord,
  saveDraft,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { validateRecord } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d21 } from "./d2-1"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.16"] })

tools.registerTool(d21)

loadUnorderedWorkflow({ wb01: ["D1.16"], wb02: ["D2.1"] })

const clauses = standardClauses.map((clause) => ({
  category: clause.category,
  text: clause.text,
  status: "Active",
}))

const template = {
  lastLegalReviewDate: "2026-11-24",
  reviewedBy: "Ama Owusu",
  jurisdiction: "Ghana",
  currency: "GHS",
  executionPercentage: 40,
  clauses,
}

let projectId: string

let ca: string

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

async function addProject(track: "Tier_1" | "Tier_3", withPm = true) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', 'T1-42', $1) RETURNING id",
    [track]
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', $1, $2, $3)",
    [track, projectId, { organization_name: "Asante Mills" }]
  )

  ca = await addPerson("Gifty Ofori", ["CA"])

  if (withPm) {
    pm = await addPerson("Ama Owusu", ["PM"])
  }

  await addRecord("D1.16", "locked", {})
}

beforeEach(async () => {
  await resetTestData(database)
  await addProject("Tier_1")
  await addRecord("D1.15", "locked", {
    budget: [{ value: 60000 }, { value: 34400 }],
  })
})

afterAll(async () => {
  await database.pool.end()
})

describe("the definition", () => {
  it("holds the sheet's eight clauses, fixed in category and text", () => {
    const table = d21.fields.find((field) => field.key === "clauses")

    expect(table?.type === "table" && table.fixedRows).toEqual(
      standardClauses.map((clause) => ({
        category: clause.category,
        text: clause.text,
      }))
    )
    expect(standardClauses).toHaveLength(8)
  })

  it("names where every bracketed value is filled in from", () => {
    expect(
      standardClauses.flatMap((clause) => placeholdersIn(clause.text))
    ).toEqual(["Client Name", "Total GHS", "X"])
  })

  it("shows the four appendices", () => {
    expect(
      d21.fields.flatMap((field) =>
        field.type === "pdfPreview" ? [field.source] : []
      )
    ).toEqual([
      { tool: "D1.15" },
      { tool: "D1.13" },
      { tool: "D1.11" },
      {
        file: "imhogen-sla.pdf",
        title: "IMHO GEN Standard Service Level Agreement (SLA)",
      },
    ])
  })
})

describe("where it starts", () => {
  it("opens once D1.16 is locked", async () => {
    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.1")
  })

  it("starts 1.0 on today, the project's PM, Ghana and GHS", async () => {
    expect(
      await contractStart(database, projectId, new Date("2026-11-24T10:00Z"))
    ).toEqual({
      lastLegalReviewDate: "2026-11-24",
      reviewedBy: "Ama Owusu",
      jurisdiction: "Ghana",
      currency: "GHS",
    })
  })

  it("leaves Reviewed By empty on a project with no PM", async () => {
    await resetTestData(database)
    await addProject("Tier_1", false)

    expect(await contractStart(database, projectId)).toMatchObject({
      reviewedBy: "",
    })
  })
})

describe("the bracketed values", () => {
  it("are the client's name, D1.15's total and the percentage typed", async () => {
    expect(await contractFills(database, projectId)).toEqual({
      "Client Name": "Asante Mills",
      "Total GHS": "GHS 94,400.00",
    })
    expect(
      await fillsOf(database, projectId, "D2.1", { executionPercentage: 40 })
    ).toEqual({
      "Client Name": "Asante Mills",
      "Total GHS": "GHS 94,400.00",
      X: "40",
    })
  })

  it("take the total from T3.D1.15a on Tier 3", async () => {
    await resetTestData(database)
    await addProject("Tier_3")
    await addRecord("T3.D1.15a", "locked", { totalT3ProjectValue: 60000 })

    expect(await contractFills(database, projectId)).toMatchObject({
      "Total GHS": "GHS 60,000.00",
    })
  })

  it("leave the total out while there is no brief", async () => {
    await resetTestData(database)
    await addProject("Tier_1")

    expect(await contractFills(database, projectId)).toEqual({
      "Client Name": "Asante Mills",
    })
  })
})

describe("the clauses", () => {
  it("refuse a change to a standard clause's text", () => {
    const changed = clauses.map((clause, index) =>
      index === 1 ? { ...clause, text: "Something else" } : clause
    )

    expect(
      validateRecord("D2.1", { clauses: changed }, { forSubmit: false })
    ).toMatchObject({
      ok: false,
      errors: [{ field: "clauses", row: 1, column: "text" }],
    })
  })

  it("refuse a standard clause taken out", () => {
    expect(
      validateRecord(
        "D2.1",
        { clauses: clauses.slice(1) },
        { forSubmit: false }
      ).ok
    ).toBe(false)
  })

  it("let a standard clause be archived, and a clause be added", () => {
    expect(
      validateRecord(
        "D2.1",
        {
          ...template,
          clauses: [
            ...clauses.map((clause, index) =>
              index === 4 ? { ...clause, status: "Archived" } : clause
            ),
            { category: "Site Access", text: "Safe access.", status: "Active" },
          ],
        },
        { forSubmit: true }
      ).ok
    ).toBe(true)
  })

  it("need an added clause's category and text at submit", () => {
    expect(
      validateRecord(
        "D2.1",
        { ...template, clauses: [...clauses, { status: "Active" }] },
        { forSubmit: true }
      )
    ).toMatchObject({
      ok: false,
      errors: [
        { field: "clauses", row: 8, column: "category" },
        { field: "clauses", row: 8, column: "text" },
      ],
    })
  })

  it("never store the SN, which the app numbers", () => {
    expect(
      validateRecord(
        "D2.1",
        { clauses: [{ ...clauses[0], sn: "2.1" }, ...clauses.slice(1)] },
        { forSubmit: false }
      ).ok
    ).toBe(false)
  })
})

describe("submitting", () => {
  it("locks it straight away, with nobody to approve, and the CA as the one who did", async () => {
    const draft = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.1",
      cycle: 1,
      values: template,
    })

    const locked = await submitRecord(database, ca, draft.id)

    expect(locked).toMatchObject({
      state: "locked",
      submittedBy: ca,
      approvedBy: ca,
    })
    expect(locked.lockedAt).not.toBeNull()
  })

  it("is refused while 1.0 or the percentage is missing", async () => {
    const draft = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.1",
      cycle: 1,
      values: { clauses },
    })

    await expect(submitRecord(database, ca, draft.id)).rejects.toThrow(
      ValidationError
    )
    expect((await getRecord(database, ca, draft.id)).state).toBe("draft")
  })
})

describe("who sees it", () => {
  it("lets only the CA write it, and the PM, HE and IT/Admin read it", async () => {
    const he = await addPerson("Yaw Boateng", ["HE"])
    const it_ = await addPerson("Efua Mensah", ["IT/Admin"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Akosua Client", ["Client"])

    for (const reader of [pm, he, it_]) {
      expect(await can(database, reader, projectId, "D2.1", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.1", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.1", "read")).toBe(
        false
      )
    }

    const id = await addRecord("D2.1", "draft", template)

    await expect(
      updateRecord(database, pm, id, { ...template, currency: "USD" })
    ).rejects.toThrow(PermissionDeniedError)
  })
})
