import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { fileReference } from "@/lib/file-reference"
import { briefingTopics } from "@/lib/kickoff-deck"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { can } from "@/server/permissions/permissions"
import { saveDraft, signField, submitRecord } from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import { kickoffDeckValues } from "@/server/team/kickoff-deck"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d41 } from "./d4-1"
import { d42 } from "./d4-2"
import { d43 } from "./d4-3"
import { d44 } from "./d4-4"
import { d45 } from "./d4-5"
import { d46 } from "./d4-6"
import { d47 } from "./d4-7"
import { d48 } from "./d4-8"

const database = createTestDatabase()

tools.registerTool(d41)

tools.registerTool(d42)

tools.registerTool(d43)

tools.registerTool(d44)

tools.registerTool(d45)

tools.registerTool(d46)

tools.registerTool(d47)

tools.registerTool(d48)

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

let projectId: string

let pm: string

let transport: FakeTransport

const today = () => new Date().toISOString().slice(0, 10)

async function addProject(track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Rice Mill", requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and as company roles.
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
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [rows[0]!.id, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [projectId, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

// Everything before D4.5, with D4.4 locked unless `withAccessLog` is false.
async function unblocked(withAccessLog = true) {
  for (const toolId of [
    "D1.15",
    "D1.16",
    "D2.1",
    "D2.2",
    "D2.6",
    "D2.12",
    "D2.14",
  ]) {
    await addRecord(toolId)
  }

  await addRecord("D3.10", { authorized: "Yes" })

  for (const toolId of ["D4.1", "D4.2", "D4.3"]) {
    await addRecord(toolId)
  }

  if (withAccessLog) {
    await addRecord("D4.4")
  }
}

async function openD45() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.5"
  )
}

const allIncluded = briefingTopics.map(({ topic }) => ({
  topic,
  included: "Yes",
}))

// A PDF the PM uploaded to the project.
async function addFile(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO files (storage, key, name, size, content_type, uploaded_by, project_id) VALUES ('uploadthing', $1, $2, 2048, 'application/pdf', $3, $4) RETURNING id",
    [`key-${crypto.randomUUID()}`, name, pm, projectId]
  )

  return fileReference(rows[0]!.id)
}

// The PM's D4.5, ready to submit once signed.
async function draft() {
  return saveDraft(database, pm, {
    projectId,
    toolId: "D4.5",
    cycle: 1,
    values: {
      deck: await addFile("Kick-off Deck.pdf"),
      slideChecklist: allIncluded,
      deckReady: "Yes",
    },
  })
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.message)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  pm = await addPerson("Ama Owusu", ["PM"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("D4.5 internal kick-off deck", () => {
  it("opens on Tier 1 once D4.4 locks", async () => {
    await unblocked(false)

    expect(await openD45()).toEqual([])

    await addRecord("D4.4")

    expect(await openD45()).toHaveLength(1)
    expect(d45.tier).toBe(1)
  })

  it("lets only the PM write it; the LE and the rest of the team only read", async () => {
    const le = await addPerson("Kojo Antwi", ["LE"])
    const he = await addPerson("Kwesi Appiah", ["HE"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, pm, projectId, "D4.5", "write")).toBe(true)
    expect(await can(database, le, projectId, "D4.5", "read")).toBe(true)
    expect(await can(database, le, projectId, "D4.5", "write")).toBe(false)
    expect(await can(database, he, projectId, "D4.5", "read")).toBe(true)
    expect(await can(database, fo, projectId, "D4.5", "read")).toBe(false)
  })

  it("shows 1.0 with the project's PM", async () => {
    await unblocked()

    const values = await kickoffDeckValues(database, projectId, {})

    expect(values).toMatchObject({ preparedBy: "Ama Owusu" })
    expect(values).not.toHaveProperty("signedDate")
  })

  it("keeps the five topics fixed, each with its source document", () => {
    const checklist = d45.fields.find((each) => each.key === "slideChecklist")

    expect(checklist).toMatchObject({
      fixedRows: [
        { topic: "Client Background & Ultimate Vision", source: "D1.8" },
        {
          topic: "Hard Scope Boundaries (What we are NOT doing)",
          source: "D1.13",
        },
        {
          topic: "Strict Timeline & Handover Dates",
          source: "D2.12:executedPdf",
        },
        {
          topic: "Financial/Budget Constraints for Prototyping",
          source: "D1.14",
        },
        { topic: "Known Technical & Operational Risks", source: "D1.11" },
      ],
    })
  })

  it("refuses to submit without the deck, with a No or without a signature", async () => {
    await unblocked()

    const unsigned = await draft()

    expect(
      await refusal(submitRecord(database, pm, unsigned.id, transport))
    ).toContain("Sign as the Project Manager before submitting")

    const signed = await signField(database, pm, unsigned.id, "pmSignature")

    // Without the deck.
    const noDeck = await saveDraft(database, pm, {
      projectId,
      toolId: "D4.5",
      cycle: 1,
      values: { slideChecklist: allIncluded, deckReady: "Yes" },
      expectedUpdatedAt: signed.updatedAt,
    })

    expect(
      await refusal(submitRecord(database, pm, noDeck.id, transport))
    ).toEqual(["Required"])

    // With the deck, a topic answered No and 3.0 answered No.
    const no = await saveDraft(database, pm, {
      projectId,
      toolId: "D4.5",
      cycle: 1,
      values: {
        deck: await addFile("Kick-off Deck.pdf"),
        slideChecklist: allIncluded.map((row, index) =>
          index === 3 ? { ...row, included: "No" } : row
        ),
        deckReady: "No",
      },
      expectedUpdatedAt: noDeck.updatedAt,
    })

    expect(await refusal(submitRecord(database, pm, no.id, transport))).toEqual(
      expect.arrayContaining([
        "Answer Yes for every topic once it is in the deck",
        "Answer Yes once the deck is complete and ready for the Internal Kick-off Meeting",
      ])
    )
  })

  it("locks on submit, with Date the day the PM signed", async () => {
    await unblocked()

    const record = await draft()

    const signed = await signField(database, pm, record.id, "pmSignature")

    const submitted = await submitRecord(database, pm, record.id, transport)

    expect(submitted.state).toBe("locked")
    expect(
      await kickoffDeckValues(database, projectId, signed.payload)
    ).toMatchObject({ signedDate: today() })
  })
})
