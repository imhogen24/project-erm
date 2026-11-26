import { PDFDocument } from "pdf-lib"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { APP_PLATFORM, SCAN, financeTasks } from "@/lib/executed-contract"
import { fileReference } from "@/lib/file-reference"
import { advanceDueOf, contractValueOf } from "@/server/contract/advance"
import {
  executedStart,
  executedValues,
  startExecutedRecord,
} from "@/server/contract/executed-contract"
import type { Storages } from "@/server/files/storage"
import { can } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
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

let client: string

let he: string

// Stands in for UploadThing: what is written is kept by its key, and the
// final contract reads as a one-page PDF.
let written: Map<string, Buffer>

let contractPdf: Buffer

let removed: string[]

const storage: Storages = {
  uploadthing: {
    signedLink: async (key) => `https://signed.example/${key}`,
    read: async (key) => written.get(key) ?? contractPdf,
    write: async (name, _type, bytes) => {
      const key = `made-${written.size}-${name}`

      written.set(key, bytes)

      return key
    },
    remove: async (key) => {
      removed.push(key)
      written.delete(key)
    },
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
    [requestId, track, rows[0]!.id, { organization_name: "Asante Mills" }]
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
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z') RETURNING id",
    [projectId, toolId, payload]
  )

  return rows[0]!.id
}

async function addFile(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO files (storage, key, name, size, content_type, uploaded_by, project_id) VALUES ('uploadthing', $1, $2, 2048, 'application/pdf', $3, $4) RETURNING id",
    [`key-${crypto.randomUUID()}`, name, ca, projectId]
  )

  return fileReference(rows[0]!.id)
}

const signedInApp = (contract: string): JsonObject => ({
  routingMethod: "Digital Signature",
  sentTo: "Kwaku Ampofo kwaku@asantemills.test",
  imhogenSignatory: "Kwesi Appiah, Head of Engineering",
  finalContract: contract,
  dateDispatched: "2026-12-04",
  dispatchConfirmed: "2026-12-04T09:00:00.000Z",
  clientViewedAt: "2026-12-04T15:00:00.000Z",
  clientSignature: { signedBy: client, signedAt: "2026-12-05T10:00:00.000Z" },
  heViewedAt: "2026-12-05T12:00:00.000Z",
  heSignature: { signedBy: he, signedAt: "2026-12-06T09:00:00.000Z" },
})

const signedOnPaper: JsonObject = {
  routingMethod: "Physical Courier",
  sentTo: "Kwaku Ampofo kwaku@asantemills.test",
  imhogenSignatory: "Kwesi Appiah, Head of Engineering",
  dateDispatched: "2026-12-04",
  dispatchConfirmed: "2026-12-04T09:00:00.000Z",
  signatories: [
    { dateSigned: "2026-12-09", status: "Signed" },
    { dateSigned: "2026-12-07", status: "Signed" },
  ],
}

// Everything before D2.12 locked, D2.11 as given.
async function reachExecuted(contract: JsonObject) {
  await addRecord("D1.16")
  await addRecord("D2.1", { executionPercentage: 40 })
  await addRecord("D2.2", {
    coreVariables: [
      { variable: "Client Legal Name", value: "Asante Mills" },
      { variable: "Client Representative", value: "Kwaku Ampofo" },
      { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
      { variable: "Total Project Duration", value: "8 weeks" },
    ],
  })

  for (const toolId of ["D2.3", "D2.4", "D2.5", "D2.6", "D2.8", "D2.10"]) {
    await addRecord(toolId)
  }

  await addRecord("D2.7", { initialResponse: "Requested Negotiation" })
  await addRecord("D2.9", { meetingOutcome: "Terms Agreed - Proceed to D2.10" })

  return addRecord("D2.11", contract)
}

function filled(values: JsonObject = {}): JsonObject {
  return {
    platform: APP_PLATFORM,
    financeTrigger: financeTasks.map((row) => ({ ...row, status: "Done" })),
    invoiceNumber: "IMHO-INV26-ADV-010",
    invoiceDate: "2026-12-08",
    fullyExecuted: "Yes",
    ...values,
  }
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

  written = new Map()
  removed = []

  const one = await PDFDocument.create()

  one.addPage()
  contractPdf = Buffer.from(await one.save())

  projectId = await addProject()
  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])
  he = await addPerson("Kwesi Appiah", ["HE"])
  client = await addPerson("Kwaku Ampofo", ["Client"])

  await addRecord("D1.15", { budget: [{ value: 60000 }, { value: 34400 }] })
})

afterAll(async () => {
  vi.restoreAllMocks()
  await database.pool.end()
})

describe("1.0, read live", () => {
  it("opens once D2.11 locks", async () => {
    await reachExecuted(signedOnPaper)

    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.12")
  })

  it("shows when it was executed in the app, who signed, the value and the advance", async () => {
    await reachExecuted(signedInApp(await addFile("Contract.pdf")))

    expect(await contractValueOf(database, projectId)).toBe(94400)
    expect(await advanceDueOf(database, projectId)).toBe(37760)

    const values = await executedValues(database, projectId, {})

    expect(values).toMatchObject({
      dateExecuted: "2026-12-06",
      clientSignatory: "Kwaku Ampofo",
      imhogenSignatory: "Kwesi Appiah, Head of Engineering",
      totalContractValue: "GHS 94,400.00",
      advanceDue: "GHS 37,760.00",
    })
    expect(values.requestId).toMatch(/^Tier_1-/)
  })

  it("dates one signed on paper by the later paper date", async () => {
    await reachExecuted(signedOnPaper)

    expect((await executedValues(database, projectId, {})).dateExecuted).toBe(
      "2026-12-09"
    )
  })

  it("takes the Tier 3 quote's total", async () => {
    projectId = await addProject("Tier_3")
    ca = await addPerson("Gifty Three", ["CA"])

    await addRecord("T3.D1.15a", { totalT3ProjectValue: 60000 })
    await addRecord("D2.1", { executionPercentage: 50 })

    expect(await contractValueOf(database, projectId)).toBe(60000)
    expect(await advanceDueOf(database, projectId)).toBe(30000)
  })
})

describe("the files the app makes", () => {
  async function executedRecords() {
    const { rows } = await database.pool.query<{ payload: JsonObject }>(
      "SELECT payload FROM tool_records WHERE project_id = $1 AND tool_id = 'D2.12'",
      [projectId]
    )

    return rows.map((row) => row.payload)
  }

  it("starts D2.12 on the contract with a signature page and the signing log, leaving D2.11 as it was", async () => {
    const contract = await addFile("IMHO_FinalContract_AsanteMills.pdf")
    const signedId = await reachExecuted(signedInApp(contract))

    const before = await database.pool.query<{ payload: JsonObject }>(
      "SELECT payload FROM tool_records WHERE id = $1",
      [signedId]
    )

    expect(await startExecutedRecord(database, ca, projectId, storage)).toBe(
      true
    )
    expect([...written.keys()]).toEqual([
      "made-0-IMHO_FinalContract_AsanteMills (Executed).pdf",
      "made-1-IMHO_FinalContract_AsanteMills (Signing log).pdf",
    ])

    const executed = await PDFDocument.load(
      written.get("made-0-IMHO_FinalContract_AsanteMills (Executed).pdf")!
    )

    expect(executed.getPageCount()).toBe(2)

    const [draft] = await executedRecords()

    expect(draft).toMatchObject({ platform: APP_PLATFORM })
    expect(draft!.executedPdf).toMatch(/^file:/)
    expect(draft!.auditCertificate).toMatch(/^file:/)

    const after = await database.pool.query<{ payload: JsonObject }>(
      "SELECT payload FROM tool_records WHERE id = $1",
      [signedId]
    )

    expect(after.rows[0]!.payload).toEqual(before.rows[0]!.payload)

    // Opened again: the draft is there, so nothing new is made.
    expect(await startExecutedRecord(database, ca, projectId, storage)).toBe(
      false
    )
    expect(written.size).toBe(2)
  })

  it("starts nothing for a contract signed on paper, which starts on Physical Scan", async () => {
    await reachExecuted(signedOnPaper)

    expect(await startExecutedRecord(database, ca, projectId, storage)).toBe(
      false
    )
    expect(await executedStart(database, projectId)).toEqual({
      platform: SCAN,
    })
    expect(written.size).toBe(0)
  })

  it("starts nothing when the contract cannot be read, so the CA uploads the files", async () => {
    await reachExecuted(signedInApp(await addFile("Contract.pdf")))

    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const broken: Storages = {
      uploadthing: {
        ...storage.uploadthing,
        read: async () => {
          throw new Error("unreachable")
        },
      },
    }

    expect(await startExecutedRecord(database, ca, projectId, broken)).toBe(
      false
    )
    expect(await executedRecords()).toEqual([])
  })

  it("removes what it stored when an attempt fails part way", async () => {
    await reachExecuted(signedInApp(await addFile("Contract.pdf")))

    vi.spyOn(console, "error").mockImplementation(() => undefined)

    let writes = 0

    const halfway: Storages = {
      uploadthing: {
        ...storage.uploadthing,
        write: async (name, type, bytes) => {
          writes += 1

          if (writes === 2) {
            throw new Error("The store is full")
          }

          return storage.uploadthing.write(name, type, bytes)
        },
      },
    }

    expect(await startExecutedRecord(database, ca, projectId, halfway)).toBe(
      false
    )
    expect(removed).toEqual(["made-0-Contract (Executed).pdf"])

    const { rows } = await database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM files WHERE name LIKE '%(Executed)%'"
    )

    expect(Number(rows[0]!.n)).toBe(0)
  })

  it("keeps the draft someone else started at the same moment, removing its own files", async () => {
    await reachExecuted(signedInApp(await addFile("Contract.pdf")))

    // The other person's draft lands while this one's files are stored.
    const racing: Storages = {
      uploadthing: {
        ...storage.uploadthing,
        write: async (name, type, bytes) => {
          const key = await storage.uploadthing.write(name, type, bytes)

          if (name.includes("Signing log")) {
            await saveDraft(database, ca, {
              projectId,
              toolId: "D2.12",
              cycle: 1,
              values: { platform: SCAN },
            })
          }

          return key
        },
      },
    }

    expect(await startExecutedRecord(database, ca, projectId, racing)).toBe(
      false
    )
    expect(removed).toHaveLength(2)
    expect(await executedRecords()).toEqual([{ platform: SCAN }])

    const { rows } = await database.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM files WHERE name LIKE '%(Executed)%'"
    )

    expect(Number(rows[0]!.n)).toBe(0)
  })
})

describe("submitting and approving", () => {
  it("refuses until the files, both tasks, the invoice, Yes and the CA's signature are in", async () => {
    await reachExecuted(signedInApp(await addFile("Contract.pdf")))

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.12",
      cycle: 1,
      values: filled({
        financeTrigger: financeTasks.map((row) => ({
          ...row,
          status: "Pending",
        })),
        invoiceNumber: "",
        fullyExecuted: "No",
      }),
    })

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual(
      expect.arrayContaining(["executedPdf", "invoiceNumber"])
    )

    const done = await updateRecord(
      database,
      ca,
      record.id,
      filled({ executedPdf: await addFile("Executed.pdf") })
    )

    expect(await refusal(submitRecord(database, ca, done.id))).toEqual([
      "auditCertificate",
      "caSignature",
    ])
  })

  it("does not ask for a certificate for a scan, and the PM approves it, which locks it", async () => {
    await reachExecuted(signedOnPaper)

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.12",
      cycle: 1,
      values: filled({
        platform: SCAN,
        executedPdf: await addFile("Scan.pdf"),
      }),
    })

    await signField(database, ca, record.id, "caSignature")

    const submitted = await submitRecord(database, ca, record.id)

    expect(submitted.state).toBe("submitted")
    expect((await approveRecord(database, pm, record.id)).state).toBe("locked")
  })

  it("refuses a pending task or No", async () => {
    await reachExecuted(signedOnPaper)

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.12",
      cycle: 1,
      values: filled({
        platform: SCAN,
        executedPdf: await addFile("Scan.pdf"),
        financeTrigger: financeTasks.map((row, index) => ({
          ...row,
          status: index === 0 ? "Done" : "Pending",
        })),
        fullyExecuted: "No",
      }),
    })

    await signField(database, ca, record.id, "caSignature")

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "financeTrigger",
      "fullyExecuted",
    ])
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM approve it, the FO, HE, CR and client read it, and nobody else see it", async () => {
    const readers = [
      pm,
      he,
      client,
      await addPerson("Esi Badu", ["FO"]),
      await addPerson("Yaw Boateng", ["CR"]),
    ]

    expect(await can(database, ca, projectId, "D2.12", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D2.12", "approve")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.12", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.12", "write")).toBe(
        false
      )
    }

    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, om, projectId, "D2.12", "read")).toBe(false)
  })
})
