import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError, createRecord } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { recordPdf } from "./record-pdf"

const database = createTestDatabase()

tools.registerTool(
  defineTool({
    id: "D1.1",
    name: "Client Email / Web Form",
    workbook: "wb01",
    fields: [
      { key: "brief", label: "Brief", type: "longText" },
      {
        key: "attachedFiles",
        label: "Attached files",
        type: "table",
        columns: [
          { key: "label", label: "Label", type: "text" },
          { key: "link", label: "Link", type: "fileLink" },
        ],
      },
    ],
  })
)

let projectId: string

let actor: string

async function addProject(name = "Boiler / Plant") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, `T1-${crypto.randomUUID()}`]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: readonly Role[], on = projectId) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, on, role]
    )
  }

  return rows[0]!.id
}

async function addRecord() {
  const record = await createRecord(database, actor, {
    projectId,
    toolId: "D1.1",
    payload: { brief: "A new boiler house" },
  })

  return record.id
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  actor = await addPerson("Everyone", ["Client", "PM", "OM", "IT/Admin"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("exporting a record as a PDF", () => {
  it("gives someone who may read the record a PDF named after the tool and project", async () => {
    const recordId = await addRecord()
    const om = await addPerson("Olu", ["OM"])

    const pdf = await recordPdf(database, om, recordId)

    expect(pdf.fileName).toBe(
      "D1.1 Client Email - Web Form - Boiler - Plant.pdf"
    )
    expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("refuses someone whose roles cannot read the tool", async () => {
    const recordId = await addRecord()
    const finance = await addPerson("Fay", ["FO"])

    await expect(recordPdf(database, finance, recordId)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })

  it("refuses someone on another project", async () => {
    const recordId = await addRecord()
    const elsewhere = await addPerson("Ola", ["OM", "PM"], await addProject())

    await expect(
      recordPdf(database, elsewhere, recordId)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a record that does not exist", async () => {
    await expect(
      recordPdf(database, actor, crypto.randomUUID())
    ).rejects.toBeInstanceOf(RecordNotFoundError)
  })
})
