import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles } from "@/db/schema"
import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  createRecord,
  getRecord,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "@/server/records/records"

import { GateClosedError, gateFor, gates } from "./gates"

const database = createTestDatabase()

let projectId: string

// Holds every role, so permissions never get in the way of a gate test.
let actor: string

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  )

  return rows[0]!.id
}

async function addActor(project: string, held: readonly Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, project, role]
    )
  }

  return rows[0]!.id
}

// Creates a record of `toolId` and walks it forward to `state`.
async function recordIn(
  state: RecordState,
  toolId: string,
  project = projectId
) {
  const record = await createRecord(database, actor, {
    projectId: project,
    toolId,
  })

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

// A gate record can itself sit behind another gate, so lock the chain first.
async function lockWithPrerequisites(toolId: string, project = projectId) {
  const gate = gateFor(toolId)

  if (gate) {
    await lockWithPrerequisites(gate.tool, project)
  }

  return recordIn("locked", toolId, project)
}

async function giveRoles(person: string, project: string) {
  for (const role of roles) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [person, project, role]
    )
  }
}

async function countRecords(toolId: string) {
  const { rows } = await database.pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM tool_records WHERE tool_id = $1",
    [toolId]
  )

  return Number(rows[0]!.n)
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Boiler")
  actor = await addActor(projectId, roles)
})

afterAll(async () => {
  await database.pool.end()
})

describe("creating a record behind a gate", () => {
  it("allows a tool that no gate guards", async () => {
    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D1.3",
    })

    expect(record.state).toBe("draft")
  })

  it("refuses when the gate record is missing, and adds nothing", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.1" })
    ).rejects.toBeInstanceOf(GateClosedError)
    expect(await countRecords("D2.1")).toBe(0)
  })

  for (const state of ["draft", "submitted", "approved"] as const) {
    it(`refuses when the gate record is only ${state}`, async () => {
      await recordIn(state, "D1.15")

      await expect(
        createRecord(database, actor, { projectId, toolId: "D2.1" })
      ).rejects.toBeInstanceOf(GateClosedError)
    })
  }

  it("allows it once the gate record is locked", async () => {
    await recordIn("locked", "D1.15")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D2.1",
    })

    expect(record.toolId).toBe("D2.1")
  })

  it("does not count a locked gate record from another project", async () => {
    const other = await addProject("Conveyor")

    await giveRoles(actor, other)
    await recordIn("locked", "D1.15", other)

    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.1" })
    ).rejects.toBeInstanceOf(GateClosedError)
  })

  it("does not count a locked record of a different tool", async () => {
    await recordIn("locked", "D1.14")

    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.1" })
    ).rejects.toBeInstanceOf(GateClosedError)
  })

  it("names the gate tool in the error", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.1" })
    ).rejects.toThrow(/D1\.15/)
  })
})

describe("every gate", () => {
  // One guarded tool per gate that the permissions table lets `actor` write.
  const guarded = new Map([
    ["D1.15", "D2.1"],
    ["D3.10", "D4.1"],
    ["D4.8", "P5.2"],
  ])

  for (const gate of gates) {
    it(`${gate.tool} keeps ${guarded.get(gate.tool)} closed until it is locked`, async () => {
      const toolId = guarded.get(gate.tool)!

      expect(gateFor(toolId)?.tool).toBe(gate.tool)

      await expect(
        createRecord(database, actor, { projectId, toolId })
      ).rejects.toBeInstanceOf(GateClosedError)

      await lockWithPrerequisites(gate.tool)

      const record = await createRecord(database, actor, { projectId, toolId })

      expect(record.toolId).toBe(toolId)
    })
  }
})

describe("gates in a chain", () => {
  it("keeps D4.8 closed until D3.10 is locked, because D3.10 guards the D4. tools", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D4.8" })
    ).rejects.toBeInstanceOf(GateClosedError)

    await recordIn("locked", "D3.10")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D4.8",
    })

    expect(record.toolId).toBe("D4.8")
  })
})

describe("which tools a gate guards", () => {
  it("matches the whole prefix, so D20.1 is not guarded by the D2. gate", () => {
    expect(gateFor("D2.1")?.tool).toBe("D1.15")
    expect(gateFor("D20.1")).toBeUndefined()
  })

  it("guards nothing in workbook 1", () => {
    expect(gateFor("D1.1")).toBeUndefined()
    expect(gateFor("D1.15")).toBeUndefined()
  })
})

describe("records that already exist", () => {
  it("can still be edited and moved after the gate record is gone", async () => {
    await recordIn("locked", "D1.15")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D2.1",
    })

    await database.pool.query(
      "DELETE FROM tool_records WHERE tool_id = 'D1.15'"
    )

    await updateRecord(database, actor, record.id, { note: "changed" })
    await transitionRecord(database, actor, record.id, "submitted")

    expect((await getRecord(database, actor, record.id)).state).toBe(
      "submitted"
    )
  })
})

describe("order of checks", () => {
  it("reports missing permission before a closed gate", async () => {
    const client = await addActor(projectId, ["Client"])

    await expect(
      createRecord(database, client, { projectId, toolId: "D2.1" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
