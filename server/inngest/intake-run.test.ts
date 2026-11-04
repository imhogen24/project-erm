import { InngestTestEngine } from "@inngest/test"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Database } from "@/db"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport } from "@/server/email/email"
import { pullNewRequests, type IntakeSummary } from "@/server/intake/intake"
import { createIntakeFixtures, registerD11 } from "@/server/intake/testing"

import { functions } from "./functions"
import { createIntakeRun } from "./intake-run"

const database = createTestDatabase()

const baseURL = "https://erm.example.com"

registerD11()

const { addTier1, addPerson, addItAdmin } = createIntakeFixtures(database)

type Pull = (database: Database) => Promise<IntakeSummary>

// The real pull, with emails kept in memory.
const realPull: Pull = (db) =>
  pullNewRequests(db, { baseURL, transport: createFakeTransport() })

// A client's details, as a database error might quote them.
const clientEmail = "ama@client.example.com"

const clientName = "Acme"

const failingPull: Pull = () =>
  Promise.reject(
    new Error(`Could not save ${clientName} (${clientEmail}) for T1-100`)
  )

function intakeRun(pull: Pull = realPull) {
  return createIntakeRun({ database: () => database, pull })
}

function execute(pull?: Pull) {
  return new InngestTestEngine({ function: intakeRun(pull) }).execute()
}

// What Inngest calls once the last retry has failed. It takes nothing from the
// failed run, so the run's error cannot reach the notice.
async function failRun() {
  const onFailure = intakeRun(failingPull).opts.onFailure

  if (!onFailure) {
    throw new Error("intake-run has no failure handler")
  }

  await onFailure()
}

async function projectRequestIds() {
  const { rows } = await database.pool.query<{ request_id: string }>(
    "SELECT request_id FROM projects ORDER BY request_id"
  )

  return rows.map((row) => row.request_id)
}

async function d11Count() {
  const { rows } = await database.pool.query<{ count: string }>(
    "SELECT count(*) FROM tool_records WHERE tool_id = 'D1.1'"
  )

  return Number(rows[0]!.count)
}

async function failureNotices(personId: string) {
  const { rows } = await database.pool.query<{
    title: string
    text: string | null
    path: string
  }>(
    "SELECT * FROM notifications WHERE person_id = $1 AND kind = 'intake_failed'",
    [personId]
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("intake-run", () => {
  it("is served, and runs every 5 minutes", () => {
    const served = functions.find((fn) => fn.id() === "intake-run")

    expect(served).toBeDefined()
    expect(served!.opts.triggers).toEqual([{ cron: "*/5 * * * *" }])
  })

  it("pulls in new requests as projects with D1.1 drafts", async () => {
    await addTier1({ requestId: "T1-100" })
    await addTier1({ requestId: "T1-200" })

    const { result, error } = await execute()

    expect(error).toBeUndefined()
    expect(result).toEqual({
      created: ["T1-100", "T1-200"],
      skipped: [],
      failed: [],
    })
    expect(await projectRequestIds()).toEqual(["T1-100", "T1-200"])
    expect(await d11Count()).toBe(2)
  })

  it("finishes and creates nothing when there is nothing new", async () => {
    const { result, error } = await execute()

    expect(error).toBeUndefined()
    expect(result).toEqual({ created: [], skipped: [], failed: [] })
    expect(await projectRequestIds()).toEqual([])
  })

  it("succeeds when one request cannot be pulled in, and reports it", async () => {
    // A blank request ID cannot become a project.
    await addTier1({
      requestId: " ",
      createdAt: new Date("2026-11-01T08:00:00Z"),
    })
    await addTier1({ requestId: "T1-200" })

    const { result, error } = await execute()

    expect(error).toBeUndefined()
    expect(result).toEqual({ created: ["T1-200"], skipped: [], failed: [" "] })
  })

  it("fails the run when the pull throws, so Inngest retries it three times", async () => {
    const { error } = await execute(failingPull)

    expect(error).toBeDefined()
    expect(intakeRun().opts.retries).toBe(3)
  })

  it("never runs twice at once: a second run waits for the first", () => {
    expect(intakeRun().opts.concurrency).toEqual({ limit: 1 })
  })

  it("keeps the client's details out of the run's error", async () => {
    const { error } = await execute(failingPull)

    const serialised = JSON.stringify(error)

    expect(serialised).not.toContain(clientEmail)
    expect(serialised).not.toContain(clientName)
  })
})

describe("intake-run failure", () => {
  it("tells every company-wide IT/Admin, and nobody else", async () => {
    const ama = await addItAdmin("Ama")
    const kofi = await addItAdmin("Kofi")
    const esi = await addPerson("Esi")

    await failRun()

    expect(await failureNotices(ama.id)).toHaveLength(1)
    expect(await failureNotices(kofi.id)).toHaveLength(1)
    expect(await failureNotices(esi.id)).toEqual([])
  })

  it("points the notice at the team page", async () => {
    const ama = await addItAdmin("Ama")

    await failRun()

    expect(await failureNotices(ama.id)).toMatchObject([
      { path: "/admin/team" },
    ])
  })

  it("tells them once when it fails twice within 6 hours", async () => {
    const ama = await addItAdmin("Ama")

    await failRun()
    await failRun()

    expect(await failureNotices(ama.id)).toHaveLength(1)
  })

  it("tells them once when two failures land together", async () => {
    const ama = await addItAdmin("Ama")

    await Promise.all([failRun(), failRun()])

    expect(await failureNotices(ama.id)).toHaveLength(1)
  })

  it("tells them again once 6 hours have passed", async () => {
    const ama = await addItAdmin("Ama")

    // Notifications cannot be changed, so the earlier notice is written old.
    await database.pool.query(
      `INSERT INTO notifications (person_id, kind, title, path, created_at)
       VALUES ($1, 'intake_failed', 'The intake run failed', '/admin/team',
               now() - interval '6 hours 1 minute')`,
      [ama.id]
    )

    await failRun()

    expect(await failureNotices(ama.id)).toHaveLength(2)
  })

  it("keeps the client's details out of the notice", async () => {
    const ama = await addItAdmin("Ama")

    await failRun()

    const [notice] = await failureNotices(ama.id)
    const shown = `${notice!.title} ${notice!.text ?? ""}`

    expect(shown).not.toContain(clientEmail)
    expect(shown).not.toContain(clientName)
    expect(shown).not.toMatch(/@/)
  })
})
