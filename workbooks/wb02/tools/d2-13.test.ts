import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { vaultDocuments } from "@/lib/archive"
import { fileReference } from "@/lib/file-reference"
import { archiveFills, archiveValues } from "@/server/contract/archive"
import type { Storages } from "@/server/files/storage"
import { archiveOf, archivedPdf } from "@/server/pdf/archive"
import { previewStates } from "@/server/pdf/previews"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d21 } from "./d2-1"
import { d22 } from "./d2-2"
import { d23 } from "./d2-3"
import { d24 } from "./d2-4"
import { d25 } from "./d2-5"
import { d26 } from "./d2-6"
import { d27 } from "./d2-7"
import { d28 } from "./d2-8"
import { d29 } from "./d2-9"
import { d210 } from "./d2-10"
import { d211 } from "./d2-11"
import { d212 } from "./d2-12"
import { d213 } from "./d2-13"
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

// The briefs by their names, with the Tier 3 one taking D1.15's place.
const note = [{ key: "note", label: "Note", type: "text" as const }]

for (const brief of [
  defineTool({
    id: "D1.15",
    name: "Project Brief & Draft Budget",
    workbook: "wb01",
    tier: 1,
    fields: note,
  }),
  defineTool({
    id: "T3.D1.15a",
    name: "T3 Drafting SOW & Quote",
    workbook: "wb01",
    tier: 3,
    replaces: "D1.15",
    fields: note,
  }),
]) {
  if (!tools.getTool(brief.id)) {
    tools.registerTool(brief)
  }
}

registerTestTools({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

for (const tool of [
  d21,
  d22,
  t3d22a,
  d23,
  d24,
  d25,
  d26,
  d27,
  d28,
  d29,
  d210,
  d211,
  d212,
  d213,
]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

let projectId: string

let ca: string

let pm: string

// Stands in for UploadThing: a file's bytes are its key.
const storage: Storages = {
  uploadthing: {
    signedLink: async (key) => `https://signed.example/${key}`,
    read: async (key) => Buffer.from(`%PDF ${key}`),
    write: async (name) => `made-${name}`,
    remove: async () => undefined,
  },
}

async function addProject(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [requestId, track, rows[0]!.id, { organization_name: "Asante Mills Ltd." }]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@imhogen.test`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z')",
    [projectId, toolId, payload]
  )
}

async function addFile(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO files (storage, key, name, size, content_type, uploaded_by, project_id) VALUES ('uploadthing', $1, $2, 2048, 'application/pdf', $3, $4) RETURNING id",
    [`key-${projectId}-${name}`, name, ca, projectId]
  )

  return fileReference(rows[0]!.id)
}

// Everything before D2.13 locked: negotiated and signed in the app, or the
// draft accepted as it was, or signed on paper.
async function reachArchive(
  route: "negotiated" | "accepted" | "paper" = "negotiated"
) {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.3", "D2.4", "D2.5"]) {
    await addRecord(toolId)
  }

  await addRecord("D2.6")
  await addRecord("D2.7", {
    initialResponse:
      route === "accepted" ? "Accepted as-is" : "Requested Negotiation",
  })

  if (route !== "accepted") {
    await addRecord("D2.8")
    await addRecord("D2.9", {
      meetingOutcome: "Terms Agreed - Proceed to D2.10",
    })
  }

  await addRecord("D2.10")
  await addRecord("D2.11")
  await addRecord("D2.12", {
    platform:
      route === "paper" ? "Physical Scan" : "IMHOGEN App (Digital Signature)",
    executedPdf: await addFile("Executed.pdf"),
    ...(route !== "paper" && {
      auditCertificate: await addFile("Signing log.pdf"),
    }),
  })
}

function vault(statuses: string[]): JsonObject[] {
  return vaultDocuments.map((row, index) => ({
    naming: row.naming,
    status: statuses[index] ?? "Done",
  }))
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.field)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  projectId = await addProject()
  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.15", { budget: [{ value: 60000 }] })
})

afterAll(async () => {
  await database.pool.end()
})

describe("what it shows", () => {
  it("opens once D2.12 locks", async () => {
    await reachArchive()

    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.13")
  })

  it("links to the archive and names each file after the client", async () => {
    const values = await archiveValues(database, projectId, {})

    expect(values.vaultLink).toBe(`/projects/${projectId}/archive`)
    expect(values.requestId).toMatch(/^Tier_1-/)
    expect(await archiveFills(database, projectId)).toEqual({
      "Client Name": "AsanteMillsLtd",
    })
  })

  it("shows each document, D2.12's two uploads among them", async () => {
    await reachArchive()

    const states = await previewStates(database, ca, projectId, d213)

    expect(
      Object.values(states).map((state) => [state.status, state.name])
    ).toEqual([
      ["ready", "D1.15 Project Brief & Draft Budget"],
      ["ready", "D2.6 Internally Approved Draft"],
      ["ready", "D2.9 Negotiation Meeting Notes"],
      ["ready", "D2.12 Executed PDF"],
      ["ready", "D2.12 Digital Audit Certificate"],
    ])
    expect(states["vault.3.document"]).toMatchObject({
      href: `/api/projects/${projectId}/tools/D2.12/uploads/executedPdf`,
    })
  })

  it("says Not needed for the notes when nobody negotiated, and for the certificate on paper", async () => {
    await reachArchive("accepted")

    const accepted = await previewStates(database, ca, projectId, d213)

    expect(accepted["vault.2.document"]?.status).toBe("notNeeded")
    expect(accepted["vault.4.document"]?.status).toBe("ready")

    projectId = await addProject()
    ca = await addPerson("Gifty Paper", ["CA"])
    await reachArchive("paper")

    const paper = await previewStates(database, ca, projectId, d213)

    expect(paper["vault.2.document"]?.status).toBe("ready")
    expect(paper["vault.4.document"]?.status).toBe("notNeeded")
  })

  it("shows T3.D1.15a on a Tier 3 project", async () => {
    projectId = await addProject("Tier_3")
    ca = await addPerson("Gifty Three", ["CA"])
    await addRecord("T3.D1.15a")

    const states = await previewStates(database, ca, projectId, d213)

    expect(states["vault.0.document"]?.name).toBe(
      "T3.D1.15a T3 Drafting SOW & Quote"
    )
  })
})

describe("submitting", () => {
  it("refuses while a row is Pending, 3.0 is No or the CA has not signed, then locks", async () => {
    await reachArchive()

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.13",
      cycle: 1,
      values: { vault: vault(["Done", "Pending"]), allPresent: "No" },
    })

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "caSignature",
      "vault",
      "allPresent",
    ])

    await updateRecord(database, ca, record.id, {
      vault: vault([]),
      allPresent: "Yes",
    })
    await signField(database, ca, record.id, "caSignature")

    const locked = await submitRecord(database, ca, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload.archivedBy).toBe("Gifty Ofori")
  })

  it("does not wait for a row the project does not need", async () => {
    await reachArchive("accepted")

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.13",
      cycle: 1,
      values: {
        vault: vault(["Done", "Done", "Pending"]),
        allPresent: "Yes",
      },
    })

    await signField(database, ca, record.id, "caSignature")

    expect((await submitRecord(database, ca, record.id)).state).toBe("locked")
  })
})

describe("the archive", () => {
  it("lists the documents under their standard names, and downloads each under it", async () => {
    await reachArchive()

    const documents = await archiveOf(database, ca, projectId)

    expect(documents.map((each) => each.fileName)).toEqual([
      "IMHO_Brief_AsanteMillsLtd.pdf",
      "IMHO_Contract_V1_AsanteMillsLtd.pdf",
      "IMHO_NegNotes_AsanteMillsLtd.pdf",
      "IMHO_ExecutedContract_AsanteMillsLtd.pdf",
      "IMHO_AuditCert_AsanteMillsLtd.pdf",
    ])
    expect(documents[3]!.download).toBe(`/api/projects/${projectId}/archive/3`)

    const executed = await archivedPdf(database, ca, projectId, 3, storage)

    expect(executed.fileName).toBe("IMHO_ExecutedContract_AsanteMillsLtd.pdf")
    expect(executed.content.toString()).toBe(
      `%PDF key-${projectId}-Executed.pdf`
    )
  })

  it("is for whoever reads D2.13: the PM and CR, never the client or the OM", async () => {
    await reachArchive()

    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])
    const om = await addPerson("Kofi Asare", ["OM"])

    for (const reader of [pm, cr]) {
      expect(await can(database, reader, projectId, "D2.13", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.13", "write")).toBe(
        false
      )
      expect(await archiveOf(database, reader, projectId)).toHaveLength(5)
    }

    for (const other of [client, om]) {
      expect(await can(database, other, projectId, "D2.13", "read")).toBe(false)
      await expect(
        archiveOf(database, other, projectId)
      ).rejects.toBeInstanceOf(PermissionDeniedError)
      await expect(
        archivedPdf(database, other, projectId, 0, storage)
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
  })
})
