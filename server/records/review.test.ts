import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import type { JsonObject, Role, ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { registerTestD11, registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import {
  ValidationError,
  approveRecord,
  createRecord,
  submitRecord,
  updateRecord,
} from "./records"

const database = createTestDatabase()

registerTestD11()

registerTestTools({ wb01: ["D1.2"] })

loadUnorderedWorkflow({ wb01: ["D1.1", "D1.2"] })

let projectId: string

let om: string

let pm: string

async function addProject(serviceTrack: ServiceTrack) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, $2) RETURNING id",
    [`${serviceTrack}-${crypto.randomUUID()}`, serviceTrack]
  )

  return rows[0]!.id
}

async function addPerson(role: Role) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [role, `${role.toLowerCase()}-${crypto.randomUUID()}@example.com`]
  )

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [rows[0]!.id, projectId, role]
  )

  return rows[0]!.id
}

function file(index: number, status: string): JsonObject {
  return {
    label: `File ${index}`,
    dateUploaded: "2026-11-01",
    fileLink: `https://utfs.io/f/file-${index}`,
    status,
  }
}

// D1.1 as the OM sends it for approval.
async function submittedD11(request: string, files: string[]) {
  const record = await createRecord(database, om, {
    projectId,
    toolId: "D1.1",
    payload: {
      requestStatus: request,
      attachedFiles: files.map((status, index) => file(index + 1, status)),
    },
  })

  return submitRecord(database, om, record.id)
}

async function stored(recordId: string) {
  const { rows } = await database.pool.query<{
    state: string
    payload: JsonObject
  }>("SELECT state, payload FROM tool_records WHERE id = $1", [recordId])

  return rows[0]!
}

const statuses = z.object({
  requestStatus: z.string(),
  attachedFiles: z.array(z.object({ status: z.string().optional() })),
})

function statusesOf(payload: JsonObject) {
  const { requestStatus, attachedFiles } = statuses.parse(payload)

  return {
    request: requestStatus,
    files: attachedFiles.map((row) => row.status),
  }
}

// The messages of the PM's refused approval.
async function refusal(recordId: string) {
  try {
    await approveRecord(database, pm, recordId)
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.message)
    }

    throw error
  }

  throw new Error("The approval was not refused")
}

beforeEach(async () => {
  await resetTestData(database)
  projectId = await addProject("Tier_1")
  om = await addPerson("OM")
  pm = await addPerson("PM")
})

afterAll(async () => {
  await database.pool.end()
})

describe("approving D1.1", () => {
  it("marks the request and every file Approved, and locks D1.1", async () => {
    const record = await submittedD11("Reviewed", ["Reviewed", "Reviewed"])

    const approved = await approveRecord(database, pm, record.id)

    expect(approved.state).toBe("locked")
    expect(statusesOf(approved.payload)).toEqual({
      request: "Approved",
      files: ["Approved", "Approved"],
    })

    const saved = await stored(record.id)

    expect(saved.state).toBe("locked")
    expect(statusesOf(saved.payload)).toEqual({
      request: "Approved",
      files: ["Approved", "Approved"],
    })
  })

  it("keeps everything else in the file rows", async () => {
    const record = await submittedD11("Reviewed", ["Reviewed"])

    const approved = await approveRecord(database, pm, record.id)

    expect(approved.payload.attachedFiles).toEqual([file(1, "Approved")])
  })

  it("is refused while one file is still pending", async () => {
    const record = await submittedD11("Reviewed", ["Reviewed", "Pending"])

    expect(await refusal(record.id)).toEqual(["1 file is still pending review"])
  })

  it("is refused while the request is still pending", async () => {
    const record = await submittedD11("Pending", ["Reviewed"])

    expect(await refusal(record.id)).toEqual([
      "The request is still pending review",
    ])
  })

  it("counts the pending files", async () => {
    const record = await submittedD11("Reviewed", [
      "Pending",
      "Reviewed",
      "Pending",
      "Pending",
    ])

    expect(await refusal(record.id)).toEqual([
      "3 files are still pending review",
    ])
  })

  it("names the request and the files together", async () => {
    const record = await submittedD11("Pending", ["Pending", "Pending"])

    expect(await refusal(record.id)).toEqual([
      "The request and 2 files are still pending review",
    ])
  })

  it("counts a file with no status as pending", async () => {
    const record = await createRecord(database, om, {
      projectId,
      toolId: "D1.1",
      payload: {
        requestStatus: "Reviewed",
        attachedFiles: [{ label: "File 1" }],
      },
    })

    await submitRecord(database, om, record.id)

    expect(await refusal(record.id)).toEqual(["1 file is still pending review"])
  })

  it("changes nothing when it is refused", async () => {
    const record = await submittedD11("Reviewed", ["Pending", "Reviewed"])

    await refusal(record.id)

    const saved = await stored(record.id)

    expect(saved.state).toBe("submitted")
    expect(statusesOf(saved.payload)).toEqual({
      request: "Reviewed",
      files: ["Pending", "Reviewed"],
    })
  })

  it("saves nothing when the approval fails after the statuses change", async () => {
    const record = await submittedD11("Reviewed", ["Reviewed"])

    // Refuses the lock, which comes after the statuses are set.
    await database.pool.query(`
      CREATE FUNCTION refuse_lock() RETURNS trigger AS $$
      BEGIN
        IF NEW.state = 'locked' THEN
          RAISE EXCEPTION 'lock refused';
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER refuse_lock BEFORE UPDATE ON tool_records
        FOR EACH ROW EXECUTE FUNCTION refuse_lock();
    `)

    try {
      await expect(approveRecord(database, pm, record.id)).rejects.toThrow()
    } finally {
      await database.pool.query(
        "DROP TRIGGER refuse_lock ON tool_records; DROP FUNCTION refuse_lock();"
      )
    }

    const saved = await stored(record.id)

    expect(saved.state).toBe("submitted")
    expect(statusesOf(saved.payload)).toEqual({
      request: "Reviewed",
      files: ["Reviewed"],
    })
  })

  it("writes the status change to the audit log, naming the PM", async () => {
    const record = await submittedD11("Reviewed", ["Reviewed"])

    await approveRecord(database, pm, record.id)

    const { rows } = await database.pool.query<{
      actor_id: string
      field: string
      old_value: unknown
      new_value: unknown
    }>(
      "SELECT actor_id, field, old_value, new_value FROM audit_log WHERE record_id = $1 AND action = 'updated' AND reason = 'Approved with the record' ORDER BY field",
      [record.id]
    )

    expect(rows).toEqual([
      {
        actor_id: pm,
        field: "payload.attachedFiles",
        old_value: [file(1, "Reviewed")],
        new_value: [file(1, "Approved")],
      },
      {
        actor_id: pm,
        field: "payload.requestStatus",
        old_value: "Reviewed",
        new_value: "Approved",
      },
    ])
  })

  it("refuses Approved sent through the form", async () => {
    const record = await createRecord(database, om, {
      projectId,
      toolId: "D1.1",
      payload: { requestStatus: "Reviewed", attachedFiles: [] },
    })

    await expect(
      updateRecord(database, om, record.id, {
        requestStatus: "Approved",
        attachedFiles: [],
      })
    ).rejects.toThrow(ValidationError)

    await expect(
      updateRecord(database, om, record.id, {
        requestStatus: "Reviewed",
        attachedFiles: [file(1, "Approved")],
      })
    ).rejects.toThrow(ValidationError)
  })

  it("approves a request with no files", async () => {
    const record = await submittedD11("Reviewed", [])

    const approved = await approveRecord(database, pm, record.id)

    expect(approved.state).toBe("locked")
    expect(statusesOf(approved.payload)).toEqual({
      request: "Approved",
      files: [],
    })
  })

  it("leaves another tool's values alone", async () => {
    const d11 = await submittedD11("Reviewed", ["Reviewed"])

    await approveRecord(database, pm, d11.id)

    const other = await createRecord(database, om, {
      projectId,
      toolId: "D1.2",
      payload: { note: "Pending" },
    })

    await submitRecord(database, om, other.id)

    const approved = await approveRecord(database, pm, other.id)

    expect(approved.payload).toEqual({ note: "Pending" })
  })

  it("works the same on a Tier 3 project", async () => {
    projectId = await addProject("Tier_3")
    om = await addPerson("OM")
    pm = await addPerson("PM")

    const pending = await submittedD11("Reviewed", ["Pending"])

    expect(await refusal(pending.id)).toEqual([
      "1 file is still pending review",
    ])

    projectId = await addProject("Tier_3")
    om = await addPerson("OM")
    pm = await addPerson("PM")

    const record = await submittedD11("Reviewed", ["Reviewed"])

    const approved = await approveRecord(database, pm, record.id)

    expect(approved.state).toBe("locked")
    expect(statusesOf(approved.payload)).toEqual({
      request: "Approved",
      files: ["Approved"],
    })
  })
})
