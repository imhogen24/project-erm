import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  approveRecord,
  lockSentDraft,
  saveDraft,
  submitRecord,
} from "@/server/records/records"
import { registerTestTools } from "@/server/tools/testing"
import { loadWorkflow } from "@/server/workflow/workflow"

import { getDocumentControl } from "./document-control"

const database = createTestDatabase()

// On D1.2 and D1.4 the PM only reads the tool in the matrix but approves it
// anyway: D1.2 with Approve, D1.4 by sending it.
registerTestTools({ wb01: ["D1.2", "D1.4"] })

loadWorkflow([
  { workbook: "wb01", tools: [{ tool: "D1.2" }, { tool: "D1.4" }] },
])

let projectId: string

async function addPerson(name: string, held: Role[] = []) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

function draft(actor: string, toolId: string) {
  return saveDraft(database, actor, {
    projectId,
    toolId,
    cycle: 1,
    values: { note: "Ready" },
  })
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1789787898386', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id
})

afterAll(async () => {
  await database.pool.end()
})

// Date checked is the time of the review's audit line, written in the same
// transaction as the approval, so it may be a few milliseconds off it.
function expectNear(actual: Date | null, expected: Date | null) {
  expect(actual).not.toBeNull()
  expect(expected).not.toBeNull()
  expect(Math.abs(actual!.getTime() - expected!.getTime())).toBeLessThan(1000)
}

const ama = {
  name: "Ama",
  role: "PM",
  department: "Operations",
}

describe("checked by on a tool the PM approves without RA", () => {
  it("names the project's PM as checker of D1.2 before approval", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om, "D1.2")

    await submitRecord(database, om, record.id)

    const control = await getDocumentControl(database, om, record.id)

    expect(control.checkedBy).toEqual({ personId: pm, ...ama })
    expect(control.checkedAt).toBeNull()
  })

  it("names the PM who approved D1.2, with the approval time", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om, "D1.2")

    await submitRecord(database, om, record.id)

    const approved = await approveRecord(database, pm, record.id)
    const control = await getDocumentControl(database, om, record.id)

    expect(control.checkedBy).toEqual({ personId: pm, ...ama })
    expectNear(control.checkedAt, approved.approvedAt)
  })

  it("names the PM who sent D1.4, with the time it was sent", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om, "D1.4")

    const sent = await lockSentDraft(database, pm, record.id, {})
    const control = await getDocumentControl(database, om, record.id)

    expect(control.checkedBy).toEqual({ personId: pm, ...ama })
    expectNear(control.checkedAt, sent.approvedAt)
  })
})
