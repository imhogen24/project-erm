import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { finalTasks } from "@/lib/final-contract"
import {
  finalContractStart,
  finalContractValues,
} from "@/server/contract/final-contract"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { recordContent } from "@/server/pdf/record-pdf"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { fieldsOff } from "@/server/records/only-when"
import {
  ValidationError,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools, toolStatus } from "@/server/workflow/workflow"

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
]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

const TERMS_AGREED = "Terms Agreed - Proceed to D2.10"

let projectId: string

let ca: string

let fo: string

let transport: FakeTransport

async function addProject(track: "Tier_1" | "Tier_3") {
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

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
}

const clauses = [
  {
    clause: "Sec 3.1 - Total Value",
    requestedChange: "Wants 10% discount",
    baselineLimit: "Min viable is GHS 90,000",
    resolution: "Agreed to 5% discount",
  },
  {
    clause: "Sec 4.1 - Timeline",
    requestedChange: "Wants 6 weeks",
    baselineLimit: "Min 7 weeks",
    resolution: "IMHOGEN held firm at 7 weeks",
  },
]

// Everything up to D2.7, locked with the client's reply.
async function reachReply(reply: string) {
  await addRecord("D1.16")
  await addRecord("D2.1")
  await addRecord("D2.2")
  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })
  await addRecord("D2.5", {
    executiveDecision: "Approved for Client Transmission",
  })
  await addRecord("D2.6")
  await addRecord("D2.7", { initialResponse: reply })
}

// A negotiated contract: D2.8 locked, and D2.9 locked with the outcome.
async function reachNotes(outcome = TERMS_AGREED) {
  await reachReply("Requested Negotiation")
  await addRecord("D2.8")
  await addRecord("D2.9", { redlines: clauses, meetingOutcome: outcome })
}

async function reachAcceptedAsIs() {
  await reachReply("Accepted as-is")
}

function finished(values: JsonObject = {}): JsonObject {
  return {
    amendments: clauses.map((row, index) => ({
      concession: row.resolution,
      section: `Section ${index + 3}.1`,
      newText: "Total Contract Value is GHS 89,680.00",
      status: "Updated",
    })),
    finalTasks: finalTasks.map((task) => ({
      task,
      assignee: "Contract Admin",
      status: "Done",
    })),
    readyForSignature: "Yes",
    ...values,
  }
}

async function draft(values: JsonObject) {
  return saveDraft(
    database,
    ca,
    { projectId, toolId: "D2.10", cycle: 1, values },
    transport
  )
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
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  transport = createFakeTransport()
  projectId = await addProject("Tier_1")
  ca = await addPerson("Gifty Ofori", ["CA"])
  fo = await addPerson("Esi Badu", ["FO"])

  await addRecord("D1.15", { budget: [{ value: 60000 }] })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("when it opens", () => {
  it("opens after D2.9 locks with Terms Agreed", async () => {
    await reachNotes()

    expect(await openTools()).toContain("D2.10")
  })

  it("stays closed after D2.9 deadlocks, and waits for D2.9, not D2.7", async () => {
    await reachReply("Requested Negotiation")
    await addRecord("D2.8")

    const status = await toolStatus(database, projectId, "D2.10")

    expect(status.waitingOn).toEqual(["D2.9"])

    await addRecord("D2.9", {
      redlines: clauses,
      meetingOutcome: "Deadlock - Escalate",
    })

    expect(await openTools()).not.toContain("D2.10")
  })

  it("opens straight after D2.7 when the client accepted the draft as it is", async () => {
    await reachAcceptedAsIs()

    expect(await openTools()).toContain("D2.10")
    expect(await openTools()).not.toContain("D2.8")
  })

  it("opens on a Tier 3 project too", async () => {
    projectId = await addProject("Tier_3")
    ca = await addPerson("Gifty Three", ["CA"])

    await reachAcceptedAsIs()

    expect(await openTools()).toContain("D2.10")
  })
})

describe("where it starts", () => {
  it("starts 2.0 on D2.9's agreed resolutions, each Pending", async () => {
    await reachNotes()

    expect(await finalContractStart(database, projectId)).toEqual({
      amendments: [
        { concession: "Agreed to 5% discount", status: "Pending" },
        { concession: "IMHOGEN held firm at 7 weeks", status: "Pending" },
      ],
    })

    const values = await finalContractValues(database, projectId, {})

    expect(values.requestId).toMatch(/^Tier_1-/)
    expect(values.projectClientName).toContain("Rice Mill")
  })

  it("starts 2.0 empty when nobody negotiated", async () => {
    await reachAcceptedAsIs()

    expect(await finalContractStart(database, projectId)).toEqual({
      amendments: [],
    })
  })
})

describe("the financial re-check", () => {
  it("is asked for on a negotiated contract, and the FO is told once the record starts", async () => {
    await reachNotes()

    expect(await fieldsOff(database, projectId, "D2.10")).toEqual(new Set())

    await draft({ amendments: [] })

    expect(await titlesFor(fo)).toContain("D2.10 is waiting for your signature")
    expect(transport.sent.map((each) => each.to)).toEqual([
      "esi.badu@imhogen.test",
    ])
    expect(transport.sent[0]!.text).toContain("Finance Rep")
  })

  it("is left out, and nobody is told, when nobody negotiated", async () => {
    await reachAcceptedAsIs()

    expect(await fieldsOff(database, projectId, "D2.10")).toEqual(
      new Set(["pricingQuestion", "financeSignature"])
    )

    const record = await draft({ amendments: [] })

    expect(await titlesFor(fo)).toEqual([])
    expect(transport.sent).toEqual([])
    await expect(
      signField(database, fo, record.id, "financeSignature")
    ).rejects.toBeInstanceOf(ValidationError)

    const titles = (
      await recordContent(database, ca, record.id)
    ).content.sections.map((section) => section.title)

    expect(titles).not.toContain(
      "3.0 Financial re-verification (If pricing changed during negotiation)"
    )
  })

  it("is signed only by the FO, who reads the rest", async () => {
    await reachNotes()

    const record = await draft(finished())

    await expect(
      signField(database, ca, record.id, "financeSignature")
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    const signed = await signField(database, fo, record.id, "financeSignature")

    expect(signed.payload.financeSignature).toMatchObject({ signedBy: fo })
    await expect(
      updateRecord(database, fo, record.id, finished())
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("submitting", () => {
  it("refuses while an amendment or a task is Pending, or 5.0 is No", async () => {
    await reachNotes()

    const record = await draft(finished())

    await signField(database, fo, record.id, "financeSignature")
    await signField(database, ca, record.id, "caSignature")

    const tries: JsonObject[] = [
      finished({
        amendments: [
          {
            concession: "Agreed to 5% discount",
            section: "Section 3.1",
            newText: "Total Contract Value is GHS 89,680.00",
            status: "Pending",
          },
        ],
      }),
      finished({
        finalTasks: finalTasks.map((task) => ({
          task,
          assignee: "Contract Admin",
          status: "Pending",
        })),
      }),
      finished({ readyForSignature: "No" }),
    ]

    const fields = []

    for (const values of tries) {
      const current = await updateRecord(database, ca, record.id, values)

      fields.push(await refusal(submitRecord(database, ca, current.id)))
    }

    expect(fields).toEqual([
      ["amendments"],
      ["finalTasks"],
      ["readyForSignature"],
    ])
  })

  it("refuses on a negotiated contract until the FO signs, then locks", async () => {
    await reachNotes()

    const record = await draft(finished())

    await signField(database, ca, record.id, "caSignature")

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "financeSignature",
    ])

    await signField(database, fo, record.id, "financeSignature")

    const locked = await submitRecord(database, ca, record.id)

    expect(locked.state).toBe("locked")
    expect(locked.payload.editedBy).toBe("Gifty Ofori")
    expect(locked.payload.finalEditDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const values = await finalContractValues(
      database,
      projectId,
      locked.payload
    )

    expect(values.signedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("locks without the FO, and with no amendments, when nobody negotiated", async () => {
    await reachAcceptedAsIs()

    const record = await draft(finished({ amendments: [] }))

    await signField(database, ca, record.id, "caSignature")

    expect((await submitRecord(database, ca, record.id)).state).toBe("locked")
  })

  it("refuses without the CA's signature", async () => {
    await reachAcceptedAsIs()

    const record = await draft(finished({ amendments: [] }))

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "caSignature",
    ])
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM, FO, HE, CR and client read it, and nobody else see it", async () => {
    const readers = [
      fo,
      await addPerson("Ama Owusu", ["PM"]),
      await addPerson("Kwesi Appiah", ["HE"]),
      await addPerson("Yaw Boateng", ["CR"]),
      await addPerson("Akosua Client", ["Client"]),
    ]

    const others = [await addPerson("Kofi Asare", ["OM"])]

    expect(await can(database, ca, projectId, "D2.10", "write")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.10", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.10", "write")).toBe(
        false
      )
    }

    for (const other of others) {
      expect(await can(database, other, projectId, "D2.10", "read")).toBe(false)
    }
  })
})
