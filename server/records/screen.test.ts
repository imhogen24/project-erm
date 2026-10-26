import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ProjectStatus, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  UnknownToolError,
  approveRecord,
  createRecord,
  saveDraft,
  signField,
  submitRecord,
} from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { loadWorkflow, workflowMaps } from "@/server/workflow/workflow"

import { getRecordScreen } from "./screen"

const database = createTestDatabase()

let projectId: string

// Holds every role, so permissions never get in the way of building records.
let actor: string

// On D1.8, LE writes and signs, PM approves and OM only reads.
let lead: string

let pm: string

let reader: string

tools.registerTool(
  defineTool({
    id: "D1.8",
    name: "Needs Assessment Notes",
    workbook: "wb01",
    fields: [
      { key: "note", label: "Note", type: "text", required: true },
      {
        key: "leadSignature",
        label: "Lead Engineer Signature",
        type: "signature",
        signedBy: ["LE"],
      },
    ],
  })
)

tools.registerTool(
  defineTool({
    id: "D1.16",
    name: "Handoff Meeting Minutes",
    workbook: "wb01",
    fields: [{ key: "note", label: "Note", type: "text" }],
  })
)

// D1.16 opens only after D1.8 is locked.
loadWorkflow([
  {
    workbook: "wb01",
    tools: [{ tool: "D1.8" }, { tool: "D1.16", after: { all: ["D1.8"] } }],
  },
  ...workflowMaps.filter((map) => map.workbook !== "wb01"),
])

async function addProject(status: ProjectStatus = "active") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track, status) VALUES ('Boiler', $1, 'Tier_1', $2) RETURNING id",
    [`T1-${crypto.randomUUID()}`, status]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: readonly Role[]) {
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

function screen(who: string, toolId = "D1.8") {
  return getRecordScreen(database, who, projectId, toolId)
}

async function draft(note = "Survey on 3 March") {
  return createRecord(database, actor, {
    projectId,
    toolId: "D1.8",
    payload: { note },
  })
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  actor = await addPerson("Everyone", [
    "PM",
    "OM",
    "LE",
    "AE",
    "FO",
    "HE",
    "IT/Admin",
  ])
  lead = await addPerson("Lea", ["LE"])
  pm = await addPerson("Pat", ["PM"])
  reader = await addPerson("Olu", ["OM"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("who may open a tool", () => {
  it("refuses a person who is not on the project", async () => {
    const stranger = (
      await database.pool.query<{ id: string }>(
        "INSERT INTO people (name, email) VALUES ('Zed', 'zed@example.com') RETURNING id"
      )
    ).rows[0]!.id

    await expect(screen(stranger)).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a person whose roles cannot read the tool", async () => {
    const finance = await addPerson("Fay", ["FO"])

    await expect(screen(finance)).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a tool that has no definition", async () => {
    await expect(screen(lead, "D9.9")).rejects.toBeInstanceOf(UnknownToolError)
  })
})

describe("a tool with no record yet", () => {
  it("is open to the writer, with no record and nothing signed", async () => {
    const view = await screen(lead)

    expect(view).toMatchObject({
      toolId: "D1.8",
      toolName: "Needs Assessment Notes",
      state: "notStarted",
      record: null,
      waiting: null,
      control: null,
      can: { write: true, approve: false, sign: [] },
    })
    expect(view.project).toMatchObject({ id: projectId, status: "active" })
  })

  it("is read only for a role that cannot write", async () => {
    expect((await screen(reader)).can).toEqual({
      write: false,
      approve: false,
      sign: [],
    })
  })

  it("says which tool it waits for when the workflow has not opened it", async () => {
    const view = await screen(actor, "D1.16")

    expect(view.state).toBe("notStarted")
    expect(view.can.write).toBe(false)
    expect(view.waiting?.waitingOn).toEqual(["D1.8"])
    expect(view.waiting?.missing.join(" ")).toContain("D1.8")
  })
})

describe("a draft", () => {
  it("shows the saved values and the time to save over, and lets the writer sign", async () => {
    const record = await draft()

    const view = await screen(lead)

    expect(view.state).toBe("draft")
    expect(view.record).toMatchObject({
      id: record.id,
      updatedAt: record.updatedAt,
      payload: { note: "Survey on 3 March" },
    })
    expect(view.can).toEqual({
      write: true,
      approve: false,
      sign: ["leadSignature"],
    })
  })

  it("does not let a role that cannot sign see a Sign action", async () => {
    await draft()

    expect((await screen(reader)).can.sign).toEqual([])
    expect((await screen(pm)).can.sign).toEqual([])
  })

  it("carries the document control block, which names the request", async () => {
    await draft()

    const { control } = await screen(lead)

    expect(control?.requestId).toMatch(/^T1-/)
    expect(control?.startedAt).toBeInstanceOf(Date)
  })

  it("shows a signature with the signer's name, and stops offering to sign it", async () => {
    const record = await draft()

    await signField(database, lead, record.id, "leadSignature")

    const view = await screen(lead)

    expect(view.record?.payload.leadSignature).toMatchObject({
      signedBy: "Lea",
    })
    expect(view.can.sign).toEqual([])
  })
})

describe("a submitted record", () => {
  async function submitted() {
    const record = await draft()

    await signField(database, lead, record.id, "leadSignature")
    await submitRecord(database, lead, record.id)

    return record
  }

  it("is read only, and the PM may approve it", async () => {
    await submitted()

    expect((await screen(pm)).state).toBe("submitted")
    expect((await screen(pm)).can).toEqual({
      write: false,
      approve: true,
      sign: [],
    })
  })

  it("does not offer approving to the person who submitted it", async () => {
    const record = await draft()
    const both = await addPerson("Both", ["LE", "PM"])

    await signField(database, both, record.id, "leadSignature")
    await submitRecord(database, both, record.id)

    expect((await screen(both)).can.approve).toBe(false)
  })

  it("does not offer approving to a role that cannot approve", async () => {
    await submitted()

    expect((await screen(reader)).can.approve).toBe(false)
  })
})

describe("a locked record", () => {
  it("is read only for everyone, and shows when it was completed", async () => {
    const record = await draft()

    await signField(database, lead, record.id, "leadSignature")
    await submitRecord(database, lead, record.id)
    await approveRecord(database, pm, record.id)

    const view = await screen(pm)

    expect(view.state).toBe("locked")
    expect(view.can).toEqual({ write: false, approve: false, sign: [] })
    expect(view.control?.completedAt).toBeInstanceOf(Date)
  })

  it("opens the next tool", async () => {
    const record = await draft()

    await signField(database, lead, record.id, "leadSignature")
    await submitRecord(database, lead, record.id)
    await approveRecord(database, pm, record.id)

    expect((await screen(actor, "D1.16")).waiting).toBeNull()
  })
})

describe("a project that is not active", () => {
  it("lets nobody write, sign or approve", async () => {
    const closed = await addProject("closed")

    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'LE')",
      [lead, closed]
    )

    const view = await getRecordScreen(database, lead, closed, "D1.8")

    expect(view.project.status).toBe("closed")
    expect(view.can).toEqual({ write: false, approve: false, sign: [] })
  })

  it("saves nothing through the screen's own record", async () => {
    const record = await draft()

    await saveDraft(database, lead, {
      projectId,
      toolId: "D1.8",
      cycle: 1,
      values: { note: "Changed" },
      expectedUpdatedAt: record.updatedAt,
    })

    expect((await screen(lead)).record?.payload.note).toBe("Changed")
  })
})
