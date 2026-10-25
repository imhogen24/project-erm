import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { defineTool } from "@/server/tools/define-tool"
import {
  SignatureWithoutSignersError,
  createToolRegistry,
  tools,
} from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import {
  InvalidTransitionError,
  RecordNotEditableError,
  SelfApprovalError,
  StaleRecordError,
  ValidationError,
  approveRecord,
  getRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
  type JsonObject,
  type ToolRecord,
} from "./records"

const database = createTestDatabase()

// On D1.3 the OM writes and the PM approves. The OM and the PM each have a
// signature field of their own.
tools.registerTool(
  defineTool({
    id: "D1.3",
    name: "Test D1.3",
    workbook: "wb01",
    fields: [
      { key: "clientName", label: "Client name", type: "text", required: true },
      { key: "notes", label: "Notes", type: "longText" },
      {
        key: "omSignature",
        label: "OM signature",
        type: "signature",
        signedBy: ["OM"],
      },
      {
        key: "pmSignature",
        label: "PM signature",
        type: "signature",
        signedBy: ["PM"],
      },
    ],
  })
)

loadUnorderedWorkflow({ wb01: ["D1.3"] })

const ACME = { clientName: "Acme" }

let projectId: string

let om: string

let pm: string

// A person holding `held` on the test project.
async function addPerson(held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

function save(
  actor: string,
  values: JsonObject,
  expectedUpdatedAt?: Date
): Promise<ToolRecord> {
  return saveDraft(database, actor, {
    projectId,
    toolId: "D1.3",
    cycle: 1,
    values,
    expectedUpdatedAt,
  })
}

// A complete draft, submitted by the OM and signed by both.
async function readyToApprove() {
  const record = await save(om, ACME)

  await signField(database, om, record.id, "omSignature")
  await signField(database, pm, record.id, "pmSignature")

  return submitRecord(database, om, record.id)
}

async function auditLines(recordId: string) {
  const { rows } = await database.pool.query<{
    action: string
    field: string
    old_value: unknown
    new_value: unknown
    reason: string | null
  }>(
    "SELECT action, field, old_value, new_value, reason FROM audit_log WHERE record_id = $1 ORDER BY created_at, field",
    [recordId]
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', 'T1-1789787898386', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id
  om = await addPerson(["OM"])
  pm = await addPerson(["PM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("saveDraft", () => {
  it("creates a draft with the values when the tool has no record", async () => {
    const record = await save(om, ACME)

    expect(record.state).toBe("draft")
    expect(record.payload).toEqual(ACME)
    expect((await getRecord(database, om, record.id)).payload).toEqual(ACME)
  })

  it("saves over a draft opened at its latest save", async () => {
    const first = await save(om, ACME)

    const second = await save(
      om,
      { ...ACME, notes: "Site visit" },
      first.updatedAt
    )

    expect(second.payload).toEqual({ ...ACME, notes: "Site visit" })
    expect(second.updatedAt.getTime()).toBeGreaterThan(
      first.updatedAt.getTime()
    )
  })

  it("refuses a save over a newer one, keeps the first, and returns the newer record", async () => {
    const opened = await save(om, ACME)
    const other = await addPerson(["OM"])

    await save(om, { ...ACME, notes: "First" }, opened.updatedAt)

    const refused = save(other, { ...ACME, notes: "Second" }, opened.updatedAt)

    await expect(refused).rejects.toBeInstanceOf(StaleRecordError)
    await expect(refused).rejects.toMatchObject({
      record: { payload: { ...ACME, notes: "First" } },
    })
    expect((await getRecord(database, om, opened.id)).payload).toEqual({
      ...ACME,
      notes: "First",
    })
  })

  it("refuses a first save when someone else created the record in between", async () => {
    await save(om, ACME)

    const other = await addPerson(["OM"])

    await expect(save(other, { clientName: "Beta" })).rejects.toThrow(
      StaleRecordError
    )
  })

  it("accepts a draft with required fields empty", async () => {
    const record = await save(om, { notes: "Started" })

    expect(record.payload).toEqual({ notes: "Started" })
  })

  it("refuses a signature written through the values", async () => {
    await expect(
      save(om, {
        ...ACME,
        pmSignature: { signedBy: pm, signedAt: new Date().toISOString() },
      })
    ).rejects.toThrow(ValidationError)
  })

  it("refuses to edit a locked record", async () => {
    const submitted = await readyToApprove()
    const locked = await approveRecord(database, pm, submitted.id)

    await expect(
      save(om, { clientName: "Beta" }, locked.updatedAt)
    ).rejects.toThrow(RecordNotEditableError)
  })
})

describe("submitRecord", () => {
  it("refuses a draft with a required field empty, naming the field", async () => {
    const record = await save(om, { notes: "Started" })

    const refused = submitRecord(database, om, record.id)

    await expect(refused).rejects.toBeInstanceOf(ValidationError)
    await expect(refused).rejects.toMatchObject({
      errors: [{ field: "clientName", message: "Required" }],
    })
  })

  it("submits a complete draft and records who submitted it and when", async () => {
    const record = await save(om, ACME)

    const submitted = await submitRecord(database, om, record.id)

    expect(submitted.state).toBe("submitted")
    expect(submitted.submittedBy).toBe(om)
    expect(submitted.submittedAt).toBeInstanceOf(Date)
  })

  it("does not need the signatures", async () => {
    const record = await save(om, ACME)

    expect((await submitRecord(database, om, record.id)).state).toBe(
      "submitted"
    )
  })

  it("keeps the signatures already given", async () => {
    const record = await save(om, ACME)

    await signField(database, om, record.id, "omSignature")

    const submitted = await submitRecord(database, om, record.id)

    expect(submitted.payload.omSignature).toEqual({
      signedBy: om,
      signedAt: expect.any(String),
    })
  })
})

describe("signField", () => {
  it("writes the signer and the time into the field", async () => {
    const record = await save(om, ACME)

    const signed = await signField(database, pm, record.id, "pmSignature")

    expect(signed.payload.pmSignature).toEqual({
      signedBy: pm,
      signedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
    })
  })

  it("refuses a person without a signedBy role", async () => {
    const record = await save(om, ACME)

    await expect(
      signField(database, om, record.id, "pmSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("refuses a field that is not a signature", async () => {
    const record = await save(om, ACME)

    await expect(
      signField(database, om, record.id, "clientName")
    ).rejects.toThrow(ValidationError)
  })

  it("can sign a submitted record", async () => {
    const record = await save(om, ACME)

    await submitRecord(database, om, record.id)

    const signed = await signField(database, pm, record.id, "pmSignature")

    expect(signed.payload.pmSignature).toMatchObject({ signedBy: pm })
  })

  it("refuses to sign a locked record", async () => {
    const submitted = await readyToApprove()

    await approveRecord(database, pm, submitted.id)

    await expect(
      signField(database, pm, submitted.id, "pmSignature")
    ).rejects.toThrow(RecordNotEditableError)
  })

  it("clears every signature when another field is edited, and logs it", async () => {
    const record = await save(om, ACME)

    await signField(database, om, record.id, "omSignature")

    const signed = await signField(database, pm, record.id, "pmSignature")

    const edited = await save(
      om,
      { ...ACME, notes: "Changed" },
      signed.updatedAt
    )

    expect(edited.payload).toEqual({ ...ACME, notes: "Changed" })

    const cleared = (await auditLines(record.id)).filter(
      (line) => line.reason === "Signatures cleared: the record was edited"
    )

    expect(cleared.map((line) => [line.field, line.new_value])).toEqual([
      ["payload.omSignature", null],
      ["payload.pmSignature", null],
    ])
  })

  it("keeps the signatures when a save changes nothing", async () => {
    const record = await save(om, ACME)
    const signed = await signField(database, pm, record.id, "pmSignature")

    const saved = await save(om, ACME, signed.updatedAt)

    expect(saved.payload.pmSignature).toMatchObject({ signedBy: pm })
  })

  it("clears the signatures on an edit through updateRecord too", async () => {
    const record = await save(om, ACME)

    await signField(database, pm, record.id, "pmSignature")

    const edited = await updateRecord(database, om, record.id, {
      clientName: "Beta",
    })

    expect(edited.payload).toEqual({ clientName: "Beta" })
  })
})

describe("approveRecord", () => {
  it("refuses a record with an unsigned signature field", async () => {
    const record = await save(om, ACME)

    await signField(database, om, record.id, "omSignature")
    await submitRecord(database, om, record.id)

    const refused = approveRecord(database, pm, record.id)

    await expect(refused).rejects.toBeInstanceOf(ValidationError)
    await expect(refused).rejects.toMatchObject({
      errors: [{ field: "pmSignature", message: "Must be signed" }],
    })
    expect((await getRecord(database, pm, record.id)).state).toBe("submitted")
  })

  it("approves and locks a signed, submitted record, recording who and when", async () => {
    const submitted = await readyToApprove()

    const locked = await approveRecord(database, pm, submitted.id)

    expect(locked.state).toBe("locked")
    expect(locked.approvedBy).toBe(pm)
    expect(locked.approvedAt).toBeInstanceOf(Date)
    expect(locked.lockedAt).toBeInstanceOf(Date)

    const moves = (await auditLines(submitted.id))
      .filter((line) => line.field === "state")
      .map((line) => [line.old_value, line.new_value])

    // Both lines share the transaction's time, so their order is not fixed.
    expect(moves).toEqual(
      expect.arrayContaining([
        ["submitted", "approved"],
        ["approved", "locked"],
      ])
    )
  })

  it("refuses the person who submitted, even when they hold an approving role", async () => {
    const both = await addPerson(["OM", "PM"])
    const record = await save(both, ACME)

    await signField(database, both, record.id, "omSignature")
    await signField(database, both, record.id, "pmSignature")
    await submitRecord(database, both, record.id)

    await expect(approveRecord(database, both, record.id)).rejects.toThrow(
      SelfApprovalError
    )
    expect((await getRecord(database, both, record.id)).state).toBe("submitted")
  })

  it("refuses a person without the right to approve", async () => {
    const submitted = await readyToApprove()
    const other = await addPerson(["OM"])

    await expect(approveRecord(database, other, submitted.id)).rejects.toThrow(
      PermissionDeniedError
    )
  })

  it("refuses a draft", async () => {
    const record = await save(om, ACME)

    await expect(approveRecord(database, pm, record.id)).rejects.toThrow(
      InvalidTransitionError
    )
  })

  it("lets only one of two simultaneous approvals through", async () => {
    const submitted = await readyToApprove()
    const otherPm = await addPerson(["PM"])

    const results = await Promise.allSettled([
      approveRecord(database, pm, submitted.id),
      approveRecord(database, otherPm, submitted.id),
    ])

    const refused = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )

    expect(refused).toHaveLength(1)
    expect(refused[0]!.reason).toBeInstanceOf(InvalidTransitionError)

    const moves = (await auditLines(submitted.id)).filter(
      (line) => line.new_value === "locked"
    )

    expect(moves).toHaveLength(1)
  })
})

describe("a signature field in a definition", () => {
  it("is refused by the registry when it names no signedBy roles", () => {
    const registry = createToolRegistry()

    expect(() =>
      registry.registerTool(
        defineTool({
          id: "D1.5",
          name: "Test D1.5",
          workbook: "wb01",
          fields: [
            { key: "pmSignature", label: "PM signature", type: "signature" },
          ],
        })
      )
    ).toThrow(SignatureWithoutSignersError)
  })

  it("is refused by the definition when a signedBy role is not a role", () => {
    expect(() =>
      defineTool({
        id: "D1.5",
        name: "Test D1.5",
        workbook: "wb01",
        fields: [
          {
            key: "pmSignature",
            label: "PM signature",
            type: "signature",
            // @ts-expect-error a role name from a schema, not one of the 19
            signedBy: ["Head of R&D"],
          },
        ],
      })
    ).toThrow()
  })
})
