import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  approveRecord,
  saveDraft,
  submitRecord,
  transitionRecord,
} from "@/server/records/records"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { getDocumentControl } from "./document-control"

const database = createTestDatabase()

// A test D1.3, open on a new project. On D1.3 the OM writes and the PM
// approves.
registerTestTools({ wb01: ["D1.3"] })

loadUnorderedWorkflow({ wb01: ["D1.3"] })

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

function draft(actor: string) {
  return saveDraft(database, actor, {
    projectId,
    toolId: "D1.3",
    cycle: 1,
    values: { note: "Site visit booked" },
  })
}

function block(actor: string, recordId: string) {
  return getDocumentControl(database, actor, recordId)
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

describe("date checked, date approved and iteration", () => {
  it("are empty, on iteration 1, until the first review", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)

    expect(await block(om, record.id)).toMatchObject({
      checkedAt: null,
      approvedAt: null,
      iteration: 1,
    })
  })

  it("date a rejection as checked and count it as an iteration", async () => {
    const om = await addPerson("Efua", ["OM"])
    const reviewer = await addPerson("Esi", ["OM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await transitionRecord(database, reviewer, record.id, "draft")

    const control = await block(om, record.id)

    expect(control.checkedAt).toBeInstanceOf(Date)
    expect(control.approvedAt).toBeNull()
    expect(control.iteration).toBe(2)
  })

  it("date the approval as checked and approved, keeping the count", async () => {
    const om = await addPerson("Efua", ["OM"])
    const reviewer = await addPerson("Esi", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await transitionRecord(database, reviewer, record.id, "draft")

    const rejected = (await block(om, record.id)).checkedAt!

    await submitRecord(database, om, record.id)
    await approveRecord(database, pm, record.id)

    const control = await block(om, record.id)

    expect(control.approvedAt).toBeInstanceOf(Date)
    // The latest review, the approval, not the rejection before it.
    expect(control.checkedAt!.getTime()).toBeGreaterThan(rejected.getTime())
    expect(control.iteration).toBe(2)
  })

  it("do not count the submitter taking their own work back", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await transitionRecord(database, om, record.id, "draft")

    expect(await block(om, record.id)).toMatchObject({
      checkedAt: null,
      iteration: 1,
    })
  })
})
