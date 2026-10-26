import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  approveRecord,
  saveDraft,
  submitRecord,
  transitionRecord,
} from "@/server/records/records"
import { registerTestTools } from "@/server/tools/testing"

import { getDocumentControl } from "./document-control"

const database = createTestDatabase()

// The real workflow map is in force, so D1.1 opens on a new project. On D1.1
// the OM and the Client write and the PM approves.
registerTestTools({ wb01: ["D1.1"] })

const REQUEST_ID = "T1-1789787898386"

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
    toolId: "D1.1",
    cycle: 1,
    values: { note: "From the website" },
  })
}

function block(actor: string, recordId: string) {
  return getDocumentControl(database, actor, recordId)
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, 'Tier_1') RETURNING id",
    [REQUEST_ID]
  )

  projectId = rows[0]!.id
})

afterAll(async () => {
  await database.pool.end()
})

describe("getDocumentControl", () => {
  it("shows the project's request ID", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    expect((await block(om, record.id)).requestId).toBe(REQUEST_ID)
  })

  it("names the one assigned OM as preparer of a draft, with role and department", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    expect((await block(om, record.id)).preparedBy).toEqual({
      personId: om,
      name: "Efua",
      role: "OM",
      department: "Operations",
    })
  })

  it("names the person who submitted as preparer once submitted", async () => {
    const om = await addPerson("Efua", ["OM"])
    const client = await addPerson("Kojo", ["Client"])
    const record = await draft(om)

    await submitRecord(database, client, record.id)

    expect((await block(om, record.id)).preparedBy).toEqual({
      personId: client,
      name: "Kojo",
      role: "Client",
      department: "External",
    })
  })

  it("names the project's PM as checker before approval", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)

    expect((await block(om, record.id)).checkedBy).toEqual({
      personId: pm,
      name: "Ama",
      role: "PM",
      department: "Operations",
    })
  })

  it("names the person who approved as checker once approved", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await approveRecord(database, pm, record.id)

    // A second PM joins later; the checker stays the one who approved.
    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = $1",
      [pm]
    )
    await addPerson("Yaw", ["PM"])

    expect((await block(om, record.id)).checkedBy).toMatchObject({
      personId: pm,
      name: "Ama",
    })
  })

  it("leaves the preparer empty when two people hold the writing role", async () => {
    const om = await addPerson("Efua", ["OM"])

    await addPerson("Esi", ["OM"])

    const record = await draft(om)

    expect((await block(om, record.id)).preparedBy).toBeNull()
  })

  it("leaves the preparer of a draft empty, with no error, when the project has no OM", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = $1",
      [om]
    )

    expect((await block(pm, record.id)).preparedBy).toBeNull()
  })

  it("leaves the checker empty when the project has no PM", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    expect((await block(om, record.id)).checkedBy).toBeNull()
  })

  it("gives the start, the completion and the time between them once locked", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await approveRecord(database, pm, record.id)
    await database.pool.query(
      "UPDATE tool_records SET created_at = locked_at - interval '90 seconds' WHERE id = $1",
      [record.id]
    )

    const control = await block(om, record.id)

    expect(control.startedAt).toBeInstanceOf(Date)
    expect(control.completedAt).toBeInstanceOf(Date)
    expect(control.durationSeconds).toBe(90)
  })

  it("leaves the completion and the duration empty until locked", async () => {
    const om = await addPerson("Efua", ["OM"])
    const record = await draft(om)

    await transitionRecord(database, om, record.id, "submitted")

    const control = await block(om, record.id)

    expect(control.startedAt).toBeInstanceOf(Date)
    expect(control.completedAt).toBeNull()
    expect(control.durationSeconds).toBeNull()
  })

  it("keeps the submitter's name after they are unassigned", async () => {
    const om = await addPerson("Efua", ["OM"])
    const pm = await addPerson("Ama", ["PM"])
    const record = await draft(om)

    await submitRecord(database, om, record.id)
    await database.pool.query(
      "DELETE FROM person_project_roles WHERE person_id = $1",
      [om]
    )

    expect((await block(pm, record.id)).preparedBy).toMatchObject({
      personId: om,
      name: "Efua",
    })
  })

  it("refuses a person without read access to the tool", async () => {
    const om = await addPerson("Efua", ["OM"])
    const le = await addPerson("Kwame", ["LE"])
    const record = await draft(om)

    await expect(block(le, record.id)).rejects.toThrow(PermissionDeniedError)
  })
})
