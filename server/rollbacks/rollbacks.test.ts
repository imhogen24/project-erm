import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { GateClosedError } from "@/server/gates/gates"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"
import {
  InvalidTransitionError,
  RecordNotEditableError,
  createRecord,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "@/server/records/records"
import { getTool, workbookNumber } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"

import {
  RollbackNotAllowedError,
  RollbackReasonMissingError,
  canRollBack,
  rollBackWorkbook,
} from "./rollbacks"

const database = createTestDatabase()

let projectId: string

// Holds every role, so permissions never get in the way of building a project.
let actor: string

// Holds only PM on the project.
let pm: string

const reason = "The client changed the scope in D1.8"

// The record whose lock opens the next workbook, from workbook 1 to 4.
const gateTools = ["D1.15", "D2.12", "D3.10", "D4.8"]

// One more record in each workbook, from workbook 1 to 5, so there is data to
// compare.
const extraTools = ["D1.8", "D2.14", "D3.1", "D4.1", "P5.2"]

registerTestTools({
  wb01: ["D1.15", "D1.8", "D1.3", "T3.D1.8a"],
  wb02: ["D2.12", "D2.14"],
  wb03: ["D3.10", "D3.1"],
  wb04: ["D4.8", "D4.1", "X.FOUR"],
  wb05: ["P5.2"],
})

// A tool's workbook, read from its definition as rollback does.
function workbookOf(toolId: string) {
  return workbookNumber(getTool(toolId)!)
}

type Row = {
  id: string
  toolId: string
  state: string
  payload: Record<string, string>
}

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [name]
  )

  return rows[0]!.id
}

async function giveRoles(
  person: string,
  project: string,
  held: readonly Role[]
) {
  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [person, project, role]
    )
  }
}

async function addPerson(project: string, held: readonly Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  await giveRoles(rows[0]!.id, project, held)

  return rows[0]!.id
}

// Creates a record of `toolId` with some data and walks it forward to `state`.
async function recordIn(
  state: RecordState,
  toolId: string,
  project = projectId
) {
  const record = await createRecord(database, actor, {
    projectId: project,
    toolId,
    payload: { note: `${toolId} on ${project}` },
  })

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

// Locks every workbook before `current` through its gate, and leaves one
// submitted record in `current`.
async function buildUpTo(current: number, project = projectId) {
  for (let workbook = 1; workbook < current; workbook++) {
    await recordIn("locked", gateTools[workbook - 1]!, project)
    await recordIn("locked", extraTools[workbook - 1]!, project)
  }

  await recordIn("submitted", extraTools[current - 1]!, project)
}

async function rowsOf(project = projectId): Promise<Row[]> {
  const { rows } = await database.pool.query<Row>(
    `SELECT id, tool_id AS "toolId", state, payload FROM tool_records
     WHERE project_id = $1 ORDER BY tool_id, created_at`,
    [project]
  )

  return rows
}

// The states found in each workbook, for example { 1: ["draft"], 2: ["void"] }.
async function statesByWorkbook(project = projectId) {
  const found: Record<number, string[]> = {}

  for (const row of await rowsOf(project)) {
    const states = (found[workbookOf(row.toolId)] ??= [])

    if (!states.includes(row.state)) {
      states.push(row.state)
    }
  }

  return found
}

async function rollBack(toWorkbook: number, who = pm, why = reason) {
  return rollBackWorkbook(database, who, {
    projectId,
    toWorkbook,
    reason: why,
  })
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Boiler")
  actor = await addPerson(projectId, roles)
  pm = await addPerson(projectId, ["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("canRollBack", () => {
  it("allows workbook 2 back to 1", () => {
    expect(canRollBack(2, 1)).toBe(true)
  })

  it.each([
    [3, 1],
    [3, 2],
    [4, 1],
    [4, 2],
    [4, 3],
  ])("allows workbook %i back to %i", (from, to) => {
    expect(canRollBack(from, to)).toBe(true)
  })

  it("allows workbook 5 back to 4", () => {
    expect(canRollBack(5, 4)).toBe(true)
  })

  it.each([
    [5, 3],
    [5, 2],
    [5, 1],
  ])("refuses workbook %i back to %i", (from, to) => {
    expect(canRollBack(from, to)).toBe(false)
  })

  it.each([
    [6, 5],
    [13, 12],
  ])("allows workbook %i back one step to %i", (from, to) => {
    expect(canRollBack(from, to)).toBe(true)
  })

  it.each([
    [6, 4],
    [13, 11],
  ])("refuses workbook %i back to %i", (from, to) => {
    expect(canRollBack(from, to)).toBe(false)
  })

  it("refuses the same workbook and a forward move", () => {
    expect(canRollBack(3, 3)).toBe(false)
    expect(canRollBack(2, 3)).toBe(false)
  })

  it("refuses a target before workbook 1", () => {
    expect(canRollBack(2, 0)).toBe(false)
  })
})

describe("rolling back", () => {
  it("voids workbook 2 and reopens workbook 1 with its data", async () => {
    await buildUpTo(2)
    const before = await rowsOf()

    await rollBack(1)

    expect(await statesByWorkbook()).toEqual({ 1: ["draft"], 2: ["void"] })
    expect(
      (await rowsOf()).map(({ id, payload }) => ({ id, payload }))
    ).toEqual(before.map(({ id, payload }) => ({ id, payload })))
  })

  it("voids workbooks 2, 3 and 4 when workbook 4 goes back to 1", async () => {
    await buildUpTo(4)

    await rollBack(1)

    expect(await statesByWorkbook()).toEqual({
      1: ["draft"],
      2: ["void"],
      3: ["void"],
      4: ["void"],
    })
  })

  it("voids only workbook 4 when it goes back to 3", async () => {
    await buildUpTo(4)

    await rollBack(3)

    expect(await statesByWorkbook()).toEqual({
      1: ["locked"],
      2: ["locked"],
      3: ["draft"],
      4: ["void"],
    })
  })

  it("leaves workbook 1 locked when workbook 4 goes back to 2", async () => {
    await buildUpTo(4)

    await rollBack(2)

    expect(await statesByWorkbook()).toEqual({
      1: ["locked"],
      2: ["draft"],
      3: ["void"],
      4: ["void"],
    })
  })

  it("voids the workbooks that exist when later ones were never started", async () => {
    await buildUpTo(3)

    await rollBack(1)

    expect(await statesByWorkbook()).toEqual({
      1: ["draft"],
      2: ["void"],
      3: ["void"],
    })
  })

  it("lets workbook 5 step back to 4", async () => {
    await buildUpTo(5)

    await rollBack(4)

    expect(await statesByWorkbook()).toEqual({
      1: ["locked"],
      2: ["locked"],
      3: ["locked"],
      4: ["draft"],
      5: ["void"],
    })
  })

  it("refuses workbook 5 back to 3, and changes nothing", async () => {
    await buildUpTo(5)
    const before = await rowsOf()

    await expect(rollBack(3)).rejects.toThrow(RollbackNotAllowedError)

    expect(await rowsOf()).toEqual(before)
  })

  it("refuses the same workbook and a forward move", async () => {
    await buildUpTo(3)
    const before = await rowsOf()

    await expect(rollBack(3)).rejects.toThrow(RollbackNotAllowedError)
    await expect(rollBack(4)).rejects.toThrow(RollbackNotAllowedError)

    expect(await rowsOf()).toEqual(before)
  })

  it("refuses a target workbook with no records, and changes nothing", async () => {
    // Workbook 2 is skipped on purpose, which the normal steps would not allow.
    await database.pool.query(
      `INSERT INTO tool_records (project_id, tool_id, state) VALUES
       ($1, 'D1.15', 'locked'), ($1, 'D3.1', 'draft')`,
      [projectId]
    )
    const before = await rowsOf()

    await expect(rollBack(2)).rejects.toThrow(RollbackNotAllowedError)

    expect(await rowsOf()).toEqual(before)
  })

  it("refuses a project with no records", async () => {
    await expect(rollBack(1)).rejects.toThrow(RollbackNotAllowedError)
  })

  it("keeps a draft record in the target workbook as it is, with no audit line", async () => {
    await buildUpTo(2)
    const draft = await recordIn("draft", "D1.3")

    await rollBack(1)

    const { rows } = await database.pool.query(
      "SELECT 1 FROM audit_log WHERE record_id = $1 AND actor_id = $2",
      [draft.id, pm]
    )

    expect(rows).toHaveLength(0)
  })

  it("leaves records voided by an earlier rollback alone", async () => {
    await buildUpTo(3)
    await rollBack(2)
    const voided = (await rowsOf()).filter((row) => row.state === "void")

    await rollBack(1)

    const { rows } = await database.pool.query(
      `SELECT 1 FROM audit_log
       WHERE record_id = ANY($1) AND new_value = '"void"'`,
      [voided.map((row) => row.id)]
    )

    expect(await statesByWorkbook()).toEqual({
      1: ["draft"],
      2: ["void"],
      3: ["void"],
    })
    // Voided once by the first rollback, never again by the second.
    expect(rows).toHaveLength(voided.length)
  })
})

describe("who and why", () => {
  it("refuses a person with every role except PM, and changes nothing", async () => {
    await buildUpTo(2)
    const before = await rowsOf()

    const notPm = await addPerson(
      projectId,
      roles.filter((role) => role !== "PM")
    )

    await expect(rollBack(1, notPm)).rejects.toThrow(PermissionDeniedError)

    expect(await rowsOf()).toEqual(before)
  })

  it("refuses the PM of another project", async () => {
    await buildUpTo(2)
    const otherPm = await addPerson(await addProject("Kiln"), ["PM"])

    await expect(rollBack(1, otherPm)).rejects.toThrow(PermissionDeniedError)
  })

  it.each(["", "   "])(
    "refuses the reason %j, and changes nothing",
    async (empty) => {
      await buildUpTo(2)
      const before = await rowsOf()

      await expect(rollBack(1, pm, empty)).rejects.toThrow(
        RollbackReasonMissingError
      )

      expect(await rowsOf()).toEqual(before)
    }
  )

  it("records the rollback", async () => {
    await buildUpTo(4)

    await rollBack(1)

    const { rows } = await database.pool.query(
      `SELECT project_id AS "projectId", from_workbook AS "fromWorkbook",
       to_workbook AS "toWorkbook", reason, approved_by AS "approvedBy",
       created_at AS "createdAt"
       FROM workbook_rollbacks`
    )

    expect(rows).toEqual([
      {
        projectId,
        fromWorkbook: 4,
        toWorkbook: 1,
        reason,
        approvedBy: pm,
        createdAt: expect.any(Date),
      },
    ])
  })

  it("writes one state audit line per changed record, by the PM", async () => {
    await buildUpTo(4)
    const before = await rowsOf()

    await rollBack(1)

    const after = await rowsOf()

    const { rows } = await database.pool.query(
      `SELECT record_id AS "recordId", action, field, old_value AS "oldValue",
       new_value AS "newValue"
       FROM audit_log WHERE actor_id = $1`,
      [pm]
    )

    // Every record changes: workbook 1 was locked, the rest were not void.
    const expected = before.map((row, index) => ({
      recordId: row.id,
      action: "transitioned",
      field: "state",
      oldValue: row.state,
      newValue: after[index]!.state,
    }))

    expect(expected.every((line) => line.oldValue !== line.newValue)).toBe(true)
    expect(rows).toHaveLength(expected.length)
    expect(rows).toEqual(expect.arrayContaining(expected))
  })

  it("ties each audit line to its rollback through the shared time", async () => {
    await buildUpTo(3)
    await rollBack(2)

    const { rows } = await database.pool.query<{ rollbackId: string }>(
      `SELECT r.id AS "rollbackId" FROM audit_log a
       JOIN workbook_rollbacks r
         ON r.project_id = a.project_id
        AND r.approved_by = a.actor_id
        AND r.created_at = a.created_at
       WHERE a.actor_id = $1`,
      [pm]
    )

    const { rows: lines } = await database.pool.query(
      "SELECT 1 FROM audit_log WHERE actor_id = $1",
      [pm]
    )

    expect(lines.length).toBeGreaterThan(0)
    expect(rows).toHaveLength(lines.length)
    expect(new Set(rows.map((row) => row.rollbackId)).size).toBe(1)
  })
})

describe("void and reopened records", () => {
  it("keeps the void records' ids and data", async () => {
    await buildUpTo(4)

    const before = (await rowsOf()).filter((row) =>
      row.toolId.startsWith("D2.")
    )

    await rollBack(1)

    const after = (await rowsOf()).filter((row) => row.toolId.startsWith("D2."))

    expect(after).toEqual(before.map((row) => ({ ...row, state: "void" })))
  })

  it("refuses to edit or move a void record", async () => {
    await buildUpTo(2)
    const [voided] = (await rowsOf()).filter((row) => row.toolId === "D2.14")

    await rollBack(1)

    await expect(
      updateRecord(database, actor, voided!.id, { note: "changed" })
    ).rejects.toThrow(RecordNotEditableError)
    await expect(
      transitionRecord(database, actor, voided!.id, "submitted")
    ).rejects.toThrow(InvalidTransitionError)
  })

  it("refuses to move any record to void", async () => {
    const draft = await recordIn("draft", "D1.8")

    await expect(
      transitionRecord(database, actor, draft.id, "void")
    ).rejects.toThrow(InvalidTransitionError)
  })

  it("still refuses to move a locked record back to draft", async () => {
    const locked = await recordIn("locked", "D1.8")

    await expect(
      transitionRecord(database, actor, locked.id, "draft")
    ).rejects.toThrow(InvalidTransitionError)
  })

  it("restarts a void workbook empty once the reopened one is locked again", async () => {
    await buildUpTo(4)
    const [old] = (await rowsOf()).filter((row) => row.toolId === "D2.14")

    await rollBack(1)

    const [gate] = (await rowsOf()).filter((row) => row.toolId === "D1.15")

    for (const step of ["submitted", "approved", "locked"] as const) {
      await transitionRecord(database, actor, gate!.id, step)
    }

    const fresh = await createRecord(database, actor, {
      projectId,
      toolId: "D2.14",
    })

    const states = Object.fromEntries(
      (await rowsOf()).map((row) => [row.id, row.state])
    )

    expect(fresh.state).toBe("draft")
    expect(fresh.payload).toEqual({})
    expect(states[old!.id]).toBe("void")
  })

  it("shows the new record in the overview, and not started for a void-only tool", async () => {
    await buildUpTo(4)

    await rollBack(1)

    const [gate] = (await rowsOf()).filter((row) => row.toolId === "D1.15")

    for (const step of ["submitted", "approved", "locked"] as const) {
      await transitionRecord(database, actor, gate!.id, step)
    }

    await createRecord(database, actor, { projectId, toolId: "D2.14" })

    const tools = ["D2.14", "D3.1"].map((id) => getTool(id)!)

    const overview = await getProjectOverview(database, actor, projectId, tools)

    expect(
      overview.tools.map(({ toolId, state }) => ({ toolId, state }))
    ).toEqual([
      { toolId: "D2.14", state: "draft" },
      { toolId: "D3.1", state: "notStarted" },
    ])
  })

  it("closes the next workbook's gate again", async () => {
    await buildUpTo(4)

    await rollBack(1)

    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.14" })
    ).rejects.toThrow(GateClosedError)
  })

  it("leaves other projects untouched", async () => {
    const other = await addProject("Kiln")
    await giveRoles(actor, other, roles)
    await buildUpTo(2, other)
    await recordIn("locked", "D2.12", other)
    await buildUpTo(3)
    const before = await rowsOf(other)

    await rollBack(1)

    expect(await rowsOf(other)).toEqual(before)
  })

  it("lets only one of two simultaneous rollbacks through", async () => {
    await buildUpTo(2)
    const secondPm = await addPerson(projectId, ["PM"])

    const workbook2 = (await rowsOf()).filter((row) =>
      row.toolId.startsWith("D2.")
    )

    const results = await Promise.allSettled([
      rollBack(1, pm),
      rollBack(1, secondPm),
    ])

    const refused = results.filter((result) => result.status === "rejected")

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({
      reason: expect.any(RollbackNotAllowedError),
    })

    const { rows: voidLines } = await database.pool.query(
      `SELECT 1 FROM audit_log WHERE new_value = '"void"'`
    )

    const { rows: rollbacks } = await database.pool.query(
      "SELECT 1 FROM workbook_rollbacks"
    )

    expect(voidLines).toHaveLength(workbook2.length)
    expect(rollbacks).toHaveLength(1)
  })
})

describe("finding a tool's workbook", () => {
  async function insertRecord(toolId: string, state: RecordState) {
    await database.pool.query(
      "INSERT INTO tool_records (project_id, tool_id, state) VALUES ($1, $2, $3)",
      [projectId, toolId, state]
    )
  }

  it("rolls back a Tier 3 project to workbook 1 with no error", async () => {
    await recordIn("locked", "D1.15")
    const drafting = await recordIn("locked", "T3.D1.8a")
    await recordIn("submitted", "D2.14")

    await rollBack(1)

    const states = Object.fromEntries(
      (await rowsOf()).map((row) => [row.toolId, row.state])
    )

    expect(states).toEqual({
      "D1.15": "draft",
      "D2.14": "void",
      "T3.D1.8a": "draft",
    })
    expect(
      (await rowsOf()).find((row) => row.id === drafting.id)?.payload
    ).toEqual({ note: `T3.D1.8a on ${projectId}` })
  })

  it("takes the workbook from the definition, whatever the id says", async () => {
    await buildUpTo(3)
    await insertRecord("X.FOUR", "submitted")

    const rollback = await rollBack(3)

    expect(rollback.fromWorkbook).toBe(4)
    expect((await rowsOf()).find((row) => row.toolId === "X.FOUR")?.state).toBe(
      "void"
    )
  })

  it("refuses a record whose tool has no definition, and changes nothing", async () => {
    await buildUpTo(2)
    await insertRecord("D9.NOPE", "draft")
    const before = await rowsOf()

    await expect(rollBack(1)).rejects.toThrow(/D9\.NOPE/)
    expect(await rowsOf()).toEqual(before)
  })
})
