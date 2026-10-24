import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  RecordNotEditableError,
  RecordNotFoundError,
  createRecord,
  getRecord,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "@/server/records/records"
import { rollBackWorkbook } from "@/server/rollbacks/rollbacks"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import {
  ChangeRequestNotAllowedError,
  ChangeRequestNotFoundError,
  ChangeRequestReasonMissingError,
  decideChange,
  requestChange,
} from "./change-requests"

const database = createTestDatabase()

let projectId: string

// Holds every role, so permissions never get in the way of building a project.
let actor: string

// On D1.8, LE writes, PM approves and OM only reads.
let writer: string

let pm: string

let reader: string

const reason = "The site survey date in D1.8 is wrong"

const rejection = "The date matches the signed survey"

registerTestTools({ wb01: ["D1.8", "D1.16"], wb02: ["D2.14"] })

loadUnorderedWorkflow({ wb01: ["D1.8", "D1.16"], wb02: ["D2.14"] })

type Line = {
  recordId: string
  actorId: string
  action: string
  field: string
  oldValue: unknown
  newValue: unknown
}

type Row = {
  id: string
  projectId: string
  recordId: string
  reason: string
  requestedBy: string
  status: string
  decidedBy: string | null
  decidedAt: Date | null
  rejectionReason: string | null
  appliedAt: Date | null
}

async function addProject(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, `T1-${crypto.randomUUID()}`]
  )

  return rows[0]!.id
}

async function addPerson(project: string, held: readonly Role[]) {
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

// Creates a record of `toolId` with some data and walks it forward to `state`.
async function recordIn(state: RecordState, toolId = "D1.8") {
  const record = await createRecord(database, actor, {
    projectId,
    toolId,
    payload: { note: "Survey on 3 March" },
  })

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

async function stateOf(recordId: string) {
  return (await getRecord(database, actor, recordId)).state
}

async function requests(): Promise<Row[]> {
  const { rows } = await database.pool.query<Row>(
    `SELECT id, project_id AS "projectId", record_id AS "recordId", reason,
     requested_by AS "requestedBy", status, decided_by AS "decidedBy",
     decided_at AS "decidedAt", rejection_reason AS "rejectionReason",
     applied_at AS "appliedAt"
     FROM change_requests ORDER BY created_at`
  )

  return rows
}

async function lines(recordId: string): Promise<Line[]> {
  const { rows } = await database.pool.query<Line>(
    `SELECT record_id AS "recordId", actor_id AS "actorId", action, field,
     old_value AS "oldValue", new_value AS "newValue"
     FROM audit_log WHERE record_id = $1 ORDER BY created_at, field`,
    [recordId]
  )

  return rows
}

// The lines a change request wrote, without the record's own history before it.
async function linesSince(recordId: string, count: number) {
  return (await lines(recordId)).slice(count)
}

function approve(requestId: string, who = pm) {
  return decideChange(database, who, requestId, { outcome: "approved" })
}

function reject(requestId: string, why = rejection, who = pm) {
  return decideChange(database, who, requestId, {
    outcome: "rejected",
    reason: why,
  })
}

async function relock(recordId: string) {
  for (const step of ["submitted", "approved", "locked"] as const) {
    await transitionRecord(database, actor, recordId, step)
  }
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Boiler")
  actor = await addPerson(projectId, roles)
  writer = await addPerson(projectId, ["LE"])
  pm = await addPerson(projectId, ["PM"])
  reader = await addPerson(projectId, ["OM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("requesting a change", () => {
  it("opens a request on a locked record for the tool's writer", async () => {
    const record = await recordIn("locked")

    const request = await requestChange(database, writer, record.id, reason)

    expect(request).toMatchObject({
      projectId,
      recordId: record.id,
      reason,
      requestedBy: writer,
      status: "requested",
      decidedBy: null,
      decidedAt: null,
    })
    expect(await requests()).toHaveLength(1)
    expect(await stateOf(record.id)).toBe("locked")
  })

  it("trims the reason", async () => {
    const record = await recordIn("locked")

    const request = await requestChange(
      database,
      writer,
      record.id,
      `  ${reason}  `
    )

    expect(request.reason).toBe(reason)
  })

  it.each(["draft", "submitted", "approved"] as const)(
    "refuses a %s record",
    async (state) => {
      const record = await recordIn(state)

      await expect(
        requestChange(database, writer, record.id, reason)
      ).rejects.toThrow(ChangeRequestNotAllowedError)
      expect(await requests()).toEqual([])
    }
  )

  it.each(["", "   "])("refuses the reason %j", async (empty) => {
    const record = await recordIn("locked")

    await expect(
      requestChange(database, writer, record.id, empty)
    ).rejects.toThrow(ChangeRequestReasonMissingError)
    expect(await requests()).toEqual([])
  })

  it("refuses a person who may only read the tool", async () => {
    const record = await recordIn("locked")

    await expect(
      requestChange(database, reader, record.id, reason)
    ).rejects.toThrow(PermissionDeniedError)
    expect(await requests()).toEqual([])
  })

  it("refuses the PM, who approves the tool but does not write it", async () => {
    const record = await recordIn("locked")

    await expect(
      requestChange(database, pm, record.id, reason)
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("refuses the writer of another project", async () => {
    const record = await recordIn("locked")
    const outsider = await addPerson(await addProject("Kiln"), ["LE"])

    await expect(
      requestChange(database, outsider, record.id, reason)
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("refuses a record that does not exist", async () => {
    await expect(
      requestChange(database, writer, crypto.randomUUID(), reason)
    ).rejects.toThrow(RecordNotFoundError)
  })

  it("refuses a second request while one is open", async () => {
    const record = await recordIn("locked")
    await requestChange(database, writer, record.id, reason)

    await expect(
      requestChange(database, actor, record.id, "Another reason")
    ).rejects.toThrow(ChangeRequestNotAllowedError)
    expect(await requests()).toHaveLength(1)
  })

  it("allows a new request once the last one was rejected", async () => {
    const record = await recordIn("locked")
    const first = await requestChange(database, writer, record.id, reason)
    await reject(first.id)

    const second = await requestChange(database, writer, record.id, reason)

    expect(second.status).toBe("requested")
  })

  it("allows a new request once the last one was applied", async () => {
    const record = await recordIn("locked")
    const first = await requestChange(database, writer, record.id, reason)
    await approve(first.id)
    await relock(record.id)

    const second = await requestChange(database, writer, record.id, reason)

    expect(second.status).toBe("requested")
  })

  it("lets only one of two simultaneous requests through", async () => {
    const record = await recordIn("locked")

    const results = await Promise.allSettled([
      requestChange(database, writer, record.id, reason),
      requestChange(database, actor, record.id, reason),
    ])

    const refused = results.filter((result) => result.status === "rejected")

    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({
      reason: expect.any(ChangeRequestNotAllowedError),
    })
    expect(await requests()).toHaveLength(1)
  })
})

describe("approving a change", () => {
  it("moves the record back to draft, keeping its data", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)

    const decided = await approve(request.id)

    expect(decided).toMatchObject({
      status: "approved",
      decidedBy: pm,
      decidedAt: expect.any(Date),
      rejectionReason: null,
    })
    expect(await getRecord(database, actor, record.id)).toMatchObject({
      state: "draft",
      payload: { note: "Survey on 3 March" },
    })
  })

  it("lets the writer edit the record again", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    await approve(request.id)

    const edited = await updateRecord(database, writer, record.id, {
      note: "Survey on 5 March",
    })

    expect(edited.payload).toEqual({ note: "Survey on 5 March" })
  })

  it("refuses anyone who is not the project's PM, and changes nothing", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)

    const notPm = await addPerson(
      projectId,
      roles.filter((role) => role !== "PM")
    )

    await expect(approve(request.id, notPm)).rejects.toThrow(
      PermissionDeniedError
    )
    await expect(reject(request.id, rejection, notPm)).rejects.toThrow(
      PermissionDeniedError
    )
    expect((await requests())[0]!.status).toBe("requested")
    expect(await stateOf(record.id)).toBe("locked")
  })

  it("refuses the PM of another project", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    const otherPm = await addPerson(await addProject("Kiln"), ["PM"])

    await expect(approve(request.id, otherPm)).rejects.toThrow(
      PermissionDeniedError
    )
  })

  it("refuses a request that does not exist", async () => {
    await expect(approve(crypto.randomUUID())).rejects.toThrow(
      ChangeRequestNotFoundError
    )
  })

  it("refuses a request that was already decided", async () => {
    const record = await recordIn("locked")
    const approved = await requestChange(database, writer, record.id, reason)
    await approve(approved.id)

    await expect(approve(approved.id)).rejects.toThrow(
      ChangeRequestNotAllowedError
    )
    await expect(reject(approved.id)).rejects.toThrow(
      ChangeRequestNotAllowedError
    )
  })

  it("lets only one of two simultaneous decisions through", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    const secondPm = await addPerson(projectId, ["PM"])

    const results = await Promise.allSettled([
      approve(request.id, pm),
      reject(request.id, rejection, secondPm),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      (await lines(record.id)).filter((line) =>
        line.action.startsWith("change_")
      )
    ).toHaveLength(2)
  })

  it("refuses to approve once a rollback has already reopened the record", async () => {
    const record = await recordIn("locked")
    await recordIn("locked", "D1.16")
    await recordIn("draft", "D2.14")
    const request = await requestChange(database, writer, record.id, reason)
    await rollBackWorkbook(database, pm, {
      projectId,
      toWorkbook: 1,
      reason: "Scope changed",
    })

    await expect(approve(request.id)).rejects.toThrow(
      ChangeRequestNotAllowedError
    )
    expect(await stateOf(record.id)).toBe("draft")
  })

  it("leaves later workbooks alone and marks them as built on a changed record", async () => {
    const record = await recordIn("locked")
    const gate = await recordIn("locked", "D1.16")
    const later = await recordIn("draft", "D2.14")
    const request = await requestChange(database, writer, record.id, reason)
    const gateLines = (await lines(gate.id)).length

    await approve(request.id)

    expect(await stateOf(later.id)).toBe("draft")
    expect(await stateOf(gate.id)).toBe("locked")
    expect(
      (await lines(later.id)).filter((line) => line.actorId === pm)
    ).toEqual([
      {
        recordId: later.id,
        actorId: pm,
        action: "built_on_change",
        field: "built_on_change",
        oldValue: null,
        newValue: { id: request.id, recordId: record.id },
      },
    ])
    expect(await linesSince(gate.id, gateLines)).toEqual([])
  })
})

describe("rejecting a change", () => {
  it("keeps the record locked and saves the reason", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)

    const decided = await reject(request.id, `  ${rejection} `)

    expect(decided).toMatchObject({
      status: "rejected",
      decidedBy: pm,
      decidedAt: expect.any(Date),
      rejectionReason: rejection,
    })
    expect(await stateOf(record.id)).toBe("locked")
    await expect(
      updateRecord(database, writer, record.id, { note: "changed" })
    ).rejects.toThrow(RecordNotEditableError)
  })

  it.each(["", "   "])(
    "refuses the reason %j, and changes nothing",
    async (empty) => {
      const record = await recordIn("locked")
      const request = await requestChange(database, writer, record.id, reason)

      await expect(reject(request.id, empty)).rejects.toThrow(
        ChangeRequestReasonMissingError
      )
      expect((await requests())[0]!.status).toBe("requested")
    }
  )
})

describe("applying a change", () => {
  it("marks the request applied once the record is locked again", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    await approve(request.id)
    await updateRecord(database, writer, record.id, {
      note: "Survey on 5 March",
    })

    await transitionRecord(database, writer, record.id, "submitted")
    await transitionRecord(database, pm, record.id, "approved")

    expect((await requests())[0]!.status).toBe("approved")

    await transitionRecord(database, pm, record.id, "locked")

    expect((await requests())[0]).toMatchObject({
      status: "applied",
      appliedAt: expect.any(Date),
    })
  })

  it("stays approved while the record is sent back to draft", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    await approve(request.id)

    await transitionRecord(database, writer, record.id, "submitted")
    await transitionRecord(database, writer, record.id, "draft")

    expect((await requests())[0]!.status).toBe("approved")
  })

  it("leaves a locked record's old requests alone", async () => {
    const record = await recordIn("locked")
    const request = await requestChange(database, writer, record.id, reason)
    await reject(request.id)

    const other = await recordIn("locked", "D1.16")

    expect((await requests())[0]!.status).toBe("rejected")
    expect(
      (await lines(other.id)).filter((line) => line.action.startsWith("change"))
    ).toEqual([])
  })

  it("still refuses to move a locked record back to draft directly", async () => {
    const record = await recordIn("locked")

    await expect(
      transitionRecord(database, actor, record.id, "draft")
    ).rejects.toThrow(InvalidTransitionError)
  })
})

describe("the audit log", () => {
  it("shows who asked, who decided and what changed, step by step", async () => {
    const record = await recordIn("locked")
    const before = (await lines(record.id)).length

    const request = await requestChange(database, writer, record.id, reason)
    await approve(request.id)
    await updateRecord(database, writer, record.id, {
      note: "Survey on 5 March",
    })
    await transitionRecord(database, writer, record.id, "submitted")
    await transitionRecord(database, pm, record.id, "approved")
    await transitionRecord(database, pm, record.id, "locked")

    const found = await linesSince(record.id, before)

    expect(
      found.map(({ actorId, action, field, oldValue, newValue }) => [
        actorId,
        action,
        field,
        oldValue,
        newValue,
      ])
    ).toEqual([
      [
        writer,
        "change_requested",
        "change_request",
        null,
        { id: request.id, status: "requested", reason },
      ],
      [
        pm,
        "change_approved",
        "change_request",
        { id: request.id, status: "requested" },
        { id: request.id, status: "approved" },
      ],
      [pm, "transitioned", "state", "locked", "draft"],
      [
        writer,
        "updated",
        "payload.note",
        "Survey on 3 March",
        "Survey on 5 March",
      ],
      [writer, "transitioned", "state", "draft", "submitted"],
      [pm, "transitioned", "state", "submitted", "approved"],
      [
        pm,
        "change_applied",
        "change_request",
        { id: request.id, status: "approved" },
        { id: request.id, status: "applied" },
      ],
      [pm, "transitioned", "state", "approved", "locked"],
    ])
  })

  it("shows who rejected and why", async () => {
    const record = await recordIn("locked")
    const before = (await lines(record.id)).length
    const request = await requestChange(database, writer, record.id, reason)

    await reject(request.id)

    expect((await linesSince(record.id, before)).slice(1)).toEqual([
      {
        recordId: record.id,
        actorId: pm,
        action: "change_rejected",
        field: "change_request",
        oldValue: { id: request.id, status: "requested" },
        newValue: { id: request.id, status: "rejected", reason: rejection },
      },
    ])
  })

  it("writes nothing for a refused request or decision", async () => {
    const record = await recordIn("locked")
    const before = (await lines(record.id)).length
    const request = await requestChange(database, writer, record.id, reason)

    await expect(
      requestChange(database, reader, record.id, reason)
    ).rejects.toThrow()
    await expect(reject(request.id, "")).rejects.toThrow()
    await expect(approve(request.id, writer)).rejects.toThrow()

    expect(await linesSince(record.id, before)).toHaveLength(1)
  })
})
