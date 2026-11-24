import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError, createRecord } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import {
  brokenPreviewSources,
  previewStates,
  storedPdf,
  toolPdf,
} from "./previews"

const database = createTestDatabase()

const brief = defineTool({
  id: "D1.1",
  name: "Client Email / Web Form",
  workbook: "wb01",
  fields: [{ key: "brief", label: "Brief", type: "longText" }],
})

// D2.1 shows D1.1 and a stored PDF. Under the permission matrix the PM reads
// both tools, the FO neither, and the client reads D1.1 but not D2.1.
const contract = defineTool({
  id: "D2.1",
  name: "Standard Contract Template",
  workbook: "wb02",
  fields: [
    {
      key: "appendixA",
      label: "Appendix A: D1.1 Client Email / Web Form",
      type: "pdfPreview",
      source: { tool: "D1.1" },
    },
    {
      key: "appendixB",
      label: "Appendix B: Company SLA",
      type: "pdfPreview",
      source: { file: "company-sla.pdf", title: "Company SLA" },
    },
  ],
})

tools.registerTool(brief)

tools.registerTool(contract)

const pdfBytes = "%PDF-1.4 stored"

let directory: string

let projectId: string

let pm: string

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    ["Boiler house", `T1-${crypto.randomUUID()}`]
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

async function addBrief() {
  const writer = await addPerson("Writer", ["Client", "PM", "OM", "IT/Admin"])

  await createRecord(database, writer, {
    projectId,
    toolId: "D1.1",
    payload: { brief: "A new boiler house" },
  })
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "erm-documents-"))
  await writeFile(path.join(directory, "company-sla.pdf"), pdfBytes)
})

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  pm = await addPerson("Pat", ["PM"])
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
  await database.pool.end()
})

describe("what a PDF preview field shows", () => {
  it("offers a stored PDF, and a tool's record once it exists", async () => {
    await addBrief()

    expect(await previewStates(database, pm, projectId, contract)).toEqual({
      appendixA: {
        status: "ready",
        name: "D1.1 Client Email / Web Form",
        href: `/api/projects/${projectId}/tools/D1.1/pdf`,
      },
      appendixB: {
        status: "ready",
        name: "Company SLA",
        href: `/api/projects/${projectId}/documents/company-sla.pdf`,
      },
    })
  })

  it("says Not started while the tool has no record", async () => {
    const states = await previewStates(database, pm, projectId, contract)

    expect(states.appendixA).toEqual({
      status: "notStarted",
      name: "D1.1 Client Email / Web Form",
    })
  })

  it("says No access, and offers no link, to someone who cannot read the tool", async () => {
    await addBrief()
    const finance = await addPerson("Fay", ["FO"])

    const states = await previewStates(database, finance, projectId, contract)

    expect(states.appendixA).toEqual({
      status: "noAccess",
      name: "D1.1 Client Email / Web Form",
    })
  })

  it("has nothing to show for a tool with no preview field", async () => {
    expect(await previewStates(database, pm, projectId, brief)).toEqual({})
  })
})

describe("the PDF of a tool's record", () => {
  it("gives the record as it is now to someone who may read it", async () => {
    await addBrief()

    const pdf = await toolPdf(database, pm, projectId, "D1.1")

    expect(pdf.fileName).toBe("D1.1 Client Email - Web Form - Boiler house.pdf")
    expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("refuses someone who cannot read the tool, record or not", async () => {
    const finance = await addPerson("Fay", ["FO"])

    await expect(
      toolPdf(database, finance, projectId, "D1.1")
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    await addBrief()

    await expect(
      toolPdf(database, finance, projectId, "D1.1")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses someone on another project", async () => {
    await addBrief()
    const elsewhere = await addPerson("Ola", ["PM"], await addProject())

    await expect(
      toolPdf(database, elsewhere, projectId, "D1.1")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("has nothing to give before the tool is started", async () => {
    await expect(
      toolPdf(database, pm, projectId, "D1.1")
    ).rejects.toBeInstanceOf(RecordNotFoundError)
  })
})

describe("a stored PDF", () => {
  it("gives it, named by its title, to someone a tool shows it to", async () => {
    const pdf = await storedPdf(
      database,
      pm,
      projectId,
      "company-sla.pdf",
      directory
    )

    expect(pdf.fileName).toBe("Company SLA.pdf")
    expect(pdf.content.toString()).toBe(pdfBytes)
  })

  it("refuses someone who reads no tool that shows it", async () => {
    const client = await addPerson("Cleo", ["Client"])

    await expect(
      storedPdf(database, client, projectId, "company-sla.pdf", directory)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a PDF no tool shows", async () => {
    await writeFile(path.join(directory, "rates.pdf"), pdfBytes)

    await expect(
      storedPdf(database, pm, projectId, "rates.pdf", directory)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a name that reaches outside the stored PDFs", async () => {
    await expect(
      storedPdf(database, pm, projectId, "../company-sla.pdf", directory)
    ).rejects.toBeInstanceOf(RecordNotFoundError)
  })
})

describe("checking where previews point", () => {
  it("names a preview of a tool that is not registered", () => {
    expect(brokenPreviewSources([contract])).toEqual([
      "D2.1.appendixA: no tool D1.1",
      "D2.1.appendixB: no file documents/company-sla.pdf",
    ])
  })
})
