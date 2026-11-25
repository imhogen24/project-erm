import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  CLIENT_WITHDRAWN,
  DEADLOCK,
  TERMS_AGREED,
} from "@/lib/negotiation-notes"
import {
  negotiationNotesStart,
  negotiationNotesValues,
} from "@/server/contract/negotiation-notes"
import { getDocumentControl } from "@/server/document-control/document-control"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { recordContent } from "@/server/pdf/record-pdf"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  getRecord,
  saveDraft,
  sentBackReason,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { toolAsShown } from "@/server/records/shown-fields"
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
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

for (const tool of [d21, d22, t3d22a, d23, d24, d25, d26, d27, d28, d29]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

let projectId: string

let ca: string

let pm: string

let he: string

let transport: FakeTransport

async function addProject(track: "Tier_1" | "Tier_3") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
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
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at, submitted_by) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z', $4) RETURNING id",
    [projectId, toolId, payload, toolId === "D2.8" ? ca : null]
  )

  return rows[0]!.id
}

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

async function projectStatus() {
  const { rows } = await database.pool.query<{ status: string }>(
    "SELECT status FROM projects WHERE id = $1",
    [projectId]
  )

  return rows[0]!.status
}

// The newest record of the tool, as the CA reads it.
async function current(toolId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = $2 AND state <> 'void' ORDER BY cycle DESC, created_at DESC LIMIT 1",
    [projectId, toolId]
  )

  return getRecord(database, ca, rows[0]!.id)
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
}

const invite: JsonObject = {
  proposedDate: "2026-12-01",
  meetingTime: "10:00",
  platform: "Google Meet",
  script: "Dear Asante Mills",
  inviteSentAt: "2026-11-25T09:00:00.000Z",
  inviteSent: "Yes",
  clientConfirmed: "Yes",
  preMeetHeld: "Yes",
  readyForMeeting: "Yes",
}

// Everything before D2.9, with D2.8 locked.
async function reachNotes() {
  await addRecord("D1.16")
  await addRecord("D2.1")
  await addRecord("D2.2")
  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })
  await addRecord("D2.5", {
    executiveDecision: "Approved for Client Transmission",
  })
  await addRecord("D2.6")
  await addRecord("D2.7", { initialResponse: "Requested Negotiation" })
  await addRecord("D2.8", invite)
}

const clause = {
  clause: "Sec 3.1 - Total Value",
  requestedChange: "Wants 10% discount on final price",
  baselineLimit: "Min viable is GHS 90,000",
  resolution: "Agreed to 5% discount",
}

function notes(outcome: string, values: JsonObject = {}): JsonObject {
  return {
    actualDate: "2026-12-01",
    startEndTime: "10:00 to 10:45",
    leadNegotiator: "Gifty Ofori",
    clientNegotiator: "Kwaku Ampofo",
    redlines: [clause],
    parkingLot: [
      {
        item: "Client legal to review the IP buyout wording",
        owner: "Client Legal Team",
        deadline: "2026-12-08",
      },
    ],
    meetingOutcome: outcome,
    nextSteps: "Apply the 5% discount.",
    ...values,
  }
}

async function draft(values: JsonObject, cycle = 1) {
  return saveDraft(database, ca, {
    projectId,
    toolId: "D2.9",
    cycle,
    values,
  })
}

// The CA records the meeting, signs and submits, which locks D2.9.
async function lockNotes(outcome: string, values: JsonObject = {}) {
  const record = await draft(notes(outcome, values))

  await signField(database, ca, record.id, "leadSignature")

  return submitRecord(database, ca, record.id, transport)
}

// The fields a refused submit names.
async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.field)
    }

    throw error
  }

  throw new Error("Expected the submit to be refused")
}

beforeEach(async () => {
  await resetTestData(database)
  // The system reopens D2.9 once the D2.8 it sent back is locked again.
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  transport = createFakeTransport()
  projectId = await addProject("Tier_1")
  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])
  he = await addPerson("Kwesi Appiah", ["HE"])

  await addRecord("D1.15", { budget: [{ value: 60000 }] })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("when it opens", () => {
  it("opens once D2.8 locks, on both tiers", async () => {
    await addRecord("D1.16")
    await addRecord("D2.7", { initialResponse: "Requested Negotiation" })

    expect(await openTools()).not.toContain("D2.9")

    await addRecord("D2.8", invite)

    expect(await openTools()).toContain("D2.9")
  })

  it("opens on a Tier 3 project too", async () => {
    projectId = await addProject("Tier_3")
    ca = await addPerson("Gifty Ofori 3", ["CA"])

    await addRecord("D1.16")
    await addRecord("D2.7", { initialResponse: "Requested Negotiation" })
    await addRecord("D2.8", invite)

    expect(await openTools()).toContain("D2.9")
  })
})

describe("where it starts", () => {
  it("starts on D2.8's proposed date, and shows the request ID", async () => {
    await reachNotes()

    expect(await negotiationNotesStart(database, projectId)).toEqual({
      actualDate: "2026-12-01",
    })

    const values = await negotiationNotesValues(database, projectId, {})

    expect(values.requestId).toMatch(/^Tier_1-/)
    expect(values).not.toHaveProperty("signedDate")
  })

  it("starts with no date before D2.8 is locked", async () => {
    expect(await negotiationNotesStart(database, projectId)).toEqual({})
  })

  it("dates the signature the day the CA signs", async () => {
    await reachNotes()

    const record = await draft(notes(TERMS_AGREED))
    const signed = await signField(database, ca, record.id, "leadSignature")

    const values = await negotiationNotesValues(
      database,
      projectId,
      signed.payload
    )

    expect(values.signedDate).toBe(new Date().toISOString().slice(0, 10))
  })

  it("starts 2.0 and 3.0 on one empty row, numbers 2.0 and leaves 3.0 optional", () => {
    const table = (key: string) => {
      const field = d29.fields.find((each) => each.key === key)

      return field?.type === "table" ? field : undefined
    }

    expect(table("redlines")?.startsWithRow).toBe(true)
    expect(table("redlines")?.required).toBe(true)
    expect(table("redlines")?.columns[0]).toMatchObject({ numbered: "2" })
    expect(table("parkingLot")?.startsWithRow).toBe(true)
    expect(table("parkingLot")?.required).toBe(false)
  })
})

describe("submitting", () => {
  beforeEach(reachNotes)

  it("refuses with no outcome", async () => {
    const unanswered = notes(TERMS_AGREED)

    delete unanswered.meetingOutcome

    const record = await draft(unanswered)

    await signField(database, ca, record.id, "leadSignature")

    expect(await refusal(submitRecord(database, ca, record.id))).toContain(
      "meetingOutcome"
    )
  })

  it("refuses with an empty 2.0 cell, or no clause at all", async () => {
    const gap = await draft(
      notes(TERMS_AGREED, { redlines: [{ ...clause, resolution: "" }] })
    )

    await signField(database, ca, gap.id, "leadSignature")

    expect(
      (await refusal(submitRecord(database, ca, gap.id))).some((field) =>
        field.startsWith("redlines")
      )
    ).toBe(true)

    await updateRecord(
      database,
      ca,
      gap.id,
      notes(TERMS_AGREED, { redlines: [] })
    )

    expect(
      (await refusal(submitRecord(database, ca, gap.id))).some((field) =>
        field.startsWith("redlines")
      )
    ).toBe(true)
  })

  it("refuses without the signature", async () => {
    const record = await draft(notes(TERMS_AGREED))

    expect(await refusal(submitRecord(database, ca, record.id))).toContain(
      "leadSignature"
    )
  })

  it("submits with an empty parking lot", async () => {
    const locked = await lockNotes(TERMS_AGREED, { parkingLot: [] })

    expect(locked.state).toBe("locked")
  })

  it("lets only the CA sign", async () => {
    const record = await draft(notes(TERMS_AGREED))

    await expect(
      signField(database, pm, record.id, "leadSignature")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("the outcome", () => {
  beforeEach(reachNotes)

  it("locks on Terms Agreed, with the project still active", async () => {
    const locked = await lockNotes(TERMS_AGREED)

    expect(locked.state).toBe("locked")
    expect(await projectStatus()).toBe("active")
    expect((await current("D2.8")).state).toBe("locked")
  })

  it("closes the project on Client Withdrawn", async () => {
    const locked = await lockNotes(CLIENT_WITHDRAWN)

    expect(locked.state).toBe("locked")
    expect(await projectStatus()).toBe("closed")
    expect(await openTools()).toEqual([])
  })

  it("on Deadlock reopens D2.8 for the CA, tells the HE and PM, and opens D2.9 again once D2.8 locks", async () => {
    const first = await lockNotes(DEADLOCK)

    expect(first.state).toBe("locked")
    expect(await projectStatus()).toBe("active")

    const back = await current("D2.8")

    expect(back.state).toBe("draft")
    expect(await sentBackReason(database, back)).toBe(
      `D2.9 sent it back: ${DEADLOCK}`
    )
    expect(await titlesFor(he)).toContain("D2.8 is open again")
    expect(await titlesFor(pm)).toContain("D2.8 is open again")

    // One email each to the HE and PM, after the lock committed.
    const sent = transport.sent.map((each) => each.to).sort()

    expect(sent).toEqual([
      "ama.owusu@imhogen.test",
      "kwesi.appiah@imhogen.test",
    ])
    expect(transport.sent[0]!.subject).toContain(
      "D2.8 Negotiation Meeting Invite on Rice Mill"
    )
    expect(transport.sent[0]!.text).toContain(DEADLOCK)

    // The CA plans the next meeting and locks D2.8 again: its second
    // iteration, and D2.9 reopens for the next meeting's notes.
    const relocked = await submitRecord(database, ca, back.id)

    expect(relocked.state).toBe("locked")
    expect((await getDocumentControl(database, ca, back.id)).iteration).toBe(2)

    const again = await current("D2.9")

    expect(again.id).toBe(first.id)
    expect(again.state).toBe("draft")
    expect(again.payload.leadSignature).toBeUndefined()

    await updateRecord(database, ca, again.id, notes(TERMS_AGREED))
    await signField(database, ca, again.id, "leadSignature")

    const agreed = await submitRecord(database, ca, again.id)

    expect(agreed.state).toBe("locked")
    expect((await getDocumentControl(database, ca, again.id)).iteration).toBe(2)
  })
})

describe("what the client gets", () => {
  let client: string
  let recordId: string

  beforeEach(async () => {
    await reachNotes()
    client = await addPerson("Akosua Client", ["Client"])
    recordId = (await draft(notes(TERMS_AGREED))).id
  })

  it("leaves the Baseline Limit out of every 2.0 row the client reads", async () => {
    const rows = (payload: JsonObject) =>
      z.array(z.record(z.string(), z.unknown())).parse(payload.redlines)

    const asClient = rows((await getRecord(database, client, recordId)).payload)

    expect(asClient).toHaveLength(1)
    expect(asClient[0]).not.toHaveProperty("baselineLimit")
    expect(asClient[0]!.resolution).toBe(clause.resolution)

    const asCa = rows((await getRecord(database, ca, recordId)).payload)

    expect(asCa[0]!.baselineLimit).toBe(clause.baselineLimit)
  })

  it("leaves the column out of the client's form and PDF only", async () => {
    const columns = (client: boolean) => {
      const field = toolAsShown(d29, { client }).fields.find(
        (each) => each.key === "redlines"
      )

      return field?.type === "table"
        ? field.columns.map((column) => column.key)
        : []
    }

    expect(columns(true)).not.toContain("baselineLimit")
    expect(columns(true)).toContain("resolution")
    expect(columns(false)).toContain("baselineLimit")

    const headers = async (person: string) => {
      const section = (
        await recordContent(database, person, recordId)
      ).content.sections.find(
        (each) => each.title === "2.0 Live redline & negotiation tracker"
      )

      return section?.kind === "table" ? section.columns : []
    }

    expect(await headers(client)).not.toContain(
      "IMHOGEN's Baseline Limit (From D2.6)"
    )
    expect(await headers(client)).toContain(
      "Final Agreed Resolution / Concession"
    )
    expect(await headers(ca)).toContain("IMHOGEN's Baseline Limit (From D2.6)")
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM, HE, CR and client read it, and nobody else see it", async () => {
    const readers = [
      pm,
      he,
      await addPerson("Yaw Boateng", ["CR"]),
      await addPerson("Akosua Client", ["Client"]),
    ]

    const others = [
      await addPerson("Kofi Asare", ["OM"]),
      await addPerson("Esi Darko", ["FO"]),
    ]

    expect(await can(database, ca, projectId, "D2.9", "write")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.9", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.9", "write")).toBe(
        false
      )
    }

    for (const other of others) {
      expect(await can(database, other, projectId, "D2.9", "read")).toBe(false)
    }
  })
})

describe("a hidden column with fixed rows", () => {
  it("leaves the column's fixed values out of the client's tool too", () => {
    const tool = {
      ...d29,
      fields: [
        {
          key: "limits",
          label: "Limits",
          type: "table" as const,
          required: false,
          fixedRows: [{ item: "Total Value", limit: "GHS 90,000" }],
          columns: [
            { key: "item", label: "Item", type: "text" as const },
            {
              key: "limit",
              label: "Limit",
              type: "text" as const,
              internalOnly: true,
            },
          ],
        },
      ],
    }

    const shown = toolAsShown(tool, { client: true }).fields[0]

    expect(shown?.type === "table" && shown.fixedRows).toEqual([
      { item: "Total Value" },
    ])
    expect(toolAsShown(tool, { client: false })).toBe(tool)
  })
})
