import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { Role, ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError, createRecord } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { sectionsOf } from "./record-document"
import { sourceName } from "./preview-source"
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

// A Tier 1 tool and the Tier 3 tool that takes its place, as D1.15 and
// T3.D1.15a are. Both have the same access under the permission matrix.
const tier1Brief = defineTool({
  id: "D1.15",
  name: "Project Brief & Draft Budget",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "summary", label: "Summary", type: "longText" }],
})

const tier3Brief = defineTool({
  id: "T3.D1.15a",
  name: "Project Quote",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.15",
  fields: [{ key: "summary", label: "Summary", type: "longText" }],
})

// A Tier 1 tool whose Tier 3 variant has no row in the permission matrix, so
// no one may read the variant even where they read the Tier 1 tool.
const tier1Scope = defineTool({
  id: "D1.13",
  name: "Draft Scope of Work",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "scope", label: "Scope", type: "longText" }],
})

const tier3Scope = defineTool({
  id: "T3.D1.13a",
  name: "Drafting Scope",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.13",
  fields: [{ key: "scope", label: "Scope", type: "longText" }],
})

// A Tier 1 tool that Tier 3 skips: no variant takes its place.
const tier1Only = defineTool({
  id: "D1.5",
  name: "Consultation Scheduling",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "when", label: "When", type: "text" }],
})

for (const each of [
  tier1Brief,
  tier3Brief,
  tier1Scope,
  tier3Scope,
  tier1Only,
]) {
  tools.registerTool(each)
}

// A contract whose appendices name the Tier 1 tools, as the sheet does.
const tieredContract = defineTool({
  id: "D2.9",
  name: "Tiered contract",
  workbook: "wb02",
  fields: [
    {
      key: "brief",
      label: "Appendix A: D1.15 Project Brief & Draft Budget",
      type: "pdfPreview",
      source: { tool: "D1.15" },
    },
    {
      key: "scope",
      label: "Appendix B: D1.13 Draft Scope of Work",
      type: "pdfPreview",
      source: { tool: "D1.13" },
    },
    {
      key: "form",
      label: "Appendix C: D1.1 Client Email / Web Form",
      type: "pdfPreview",
      source: { tool: "D1.1" },
    },
    {
      key: "meeting",
      label: "Appendix D: D1.5 Consultation Scheduling",
      type: "pdfPreview",
      source: { tool: "D1.5" },
    },
  ],
})

const pdfBytes = "%PDF-1.4 stored"

let directory: string

let projectId: string

let pm: string

async function addProject(track: ServiceTrack = "Tier_1") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Boiler house", `T1-${crypto.randomUUID()}`, track]
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

describe("a preview on a Tier 3 project", () => {
  let tier3: string

  // Inserted directly: these tools stand in for real ones, so the workflow
  // would wait on tools this file does not have.
  async function addRecordOf(toolId: string, on: string) {
    await database.pool.query(
      "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload) VALUES ($1, $2, 1, 'draft', $3)",
      [on, toolId, JSON.stringify({ summary: "Scan a part" })]
    )
  }

  beforeEach(async () => {
    tier3 = await addProject("Tier_3")
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'PM')",
      [pm, tier3]
    )
  })

  it("shows the Tier 3 tool that takes the place of the one named", async () => {
    expect(
      (await previewStates(database, pm, tier3, tieredContract)).brief
    ).toEqual({ status: "notStarted", name: "T3.D1.15a Project Quote" })

    await addRecordOf("T3.D1.15a", tier3)

    expect(
      (await previewStates(database, pm, tier3, tieredContract)).brief
    ).toEqual({
      status: "ready",
      name: "T3.D1.15a Project Quote",
      href: `/api/projects/${tier3}/tools/T3.D1.15a/pdf`,
    })
  })

  it("shows the tool itself when it has no Tier 3 version", async () => {
    const states = await previewStates(database, pm, tier3, tieredContract)

    expect(states.form).toEqual({
      status: "notStarted",
      name: "D1.1 Client Email / Web Form",
    })
  })

  it("says Not started for a tool the Tier 3 track skips", async () => {
    const states = await previewStates(database, pm, tier3, tieredContract)

    expect(states.meeting).toEqual({
      status: "notStarted",
      name: "D1.5 Consultation Scheduling",
    })
  })

  it("follows the access of the tool shown, not the one named", async () => {
    const states = await previewStates(database, pm, tier3, tieredContract)

    expect(states.scope).toEqual({
      status: "noAccess",
      name: "T3.D1.13a Drafting Scope",
    })

    await expect(toolPdf(database, pm, tier3, "D1.13")).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })

  it("keeps showing the Tier 1 tool on a Tier 1 project", async () => {
    await addRecordOf("D1.15", projectId)

    expect(
      (await previewStates(database, pm, projectId, tieredContract)).brief
    ).toEqual({
      status: "ready",
      name: "D1.15 Project Brief & Draft Budget",
      href: `/api/projects/${projectId}/tools/D1.15/pdf`,
    })

    expect(
      (await previewStates(database, pm, projectId, tieredContract)).scope
    ).toEqual({ status: "notStarted", name: "D1.13 Draft Scope of Work" })
  })

  it("gives the Tier 3 tool's PDF at the Tier 1 tool's address", async () => {
    await expect(toolPdf(database, pm, tier3, "D1.15")).rejects.toBeInstanceOf(
      RecordNotFoundError
    )

    await addRecordOf("T3.D1.15a", tier3)

    const pdf = await toolPdf(database, pm, tier3, "D1.15")

    expect(pdf.fileName).toBe("T3.D1.15a Project Quote - Boiler house.pdf")
    expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("gives nothing for a tool the project's track does not use", async () => {
    await addRecordOf("T3.D1.15a", tier3)

    await expect(toolPdf(database, pm, tier3, "D1.5")).rejects.toBeInstanceOf(
      RecordNotFoundError
    )

    await expect(
      toolPdf(database, pm, projectId, "T3.D1.15a")
    ).rejects.toBeInstanceOf(RecordNotFoundError)
  })

  it("names the tool shown in an exported PDF", () => {
    expect(sourceName({ tool: "D1.15" }, "Tier_3")).toBe(
      "T3.D1.15a Project Quote"
    )
    expect(sourceName({ tool: "D1.15" }, "Tier_1")).toBe(
      "D1.15 Project Brief & Draft Budget"
    )

    const [appendices] = sectionsOf(tieredContract, {}, new Map(), "Tier_3")

    expect(appendices).toMatchObject({
      rows: [
        { value: "T3.D1.15a Project Quote" },
        { value: "T3.D1.13a Drafting Scope" },
        { value: "D1.1 Client Email / Web Form" },
        { value: "D1.5 Consultation Scheduling" },
      ],
    })
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
