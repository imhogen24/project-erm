import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"

import { copySubmission, findNewSubmissions } from "./submissions"

const database = createTestDatabase()

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

// The website writes these. A test writes them here only to have something to
// read.
async function addTier1(requestId: string, createdAt = new Date()) {
  await database.pool.query(
    `INSERT INTO custom_engineering_submissions (
      custom_engineering_id, organization_name, contact_person, email,
      phone_number, site_location, project_scope, project_title,
      primary_objective, material_inputs, energy_and_information_inputs,
      transformation, outputs, file_attachments, terms_accepted_at,
      request_id, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, 'Acme', 'Ama', 'ama@example.com', '0200000000',
      'Accra', '["Design"]', 'Conveyor', 'Move boxes', 'Steel', 'Power',
      'Cut and weld', 'A conveyor', '["https://files.example.com/a.pdf"]',
      $2, $1, $2, $2
    )`,
    [requestId, createdAt]
  )
}

async function addTier3(requestId: string, createdAt = new Date()) {
  await database.pool.query(
    `INSERT INTO drafting_digitization_submissions (
      drafting_digitization_id, organization_name, contact_person, email,
      phone_number, site_location, input_material_type, asset_condition,
      drafting_services, end_goal, drafting_standard, output_formats,
      file_attachment, terms_accepted_at, request_id, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, 'Acme', 'Kofi', 'kofi@example.com',
      '0200000000', 'Kumasi', 'Paper drawings', 'Good', '["2D drafting"]',
      'Archive', 'ISO', '["DWG"]', '["https://files.example.com/b.pdf"]',
      $2, $1, $2, $2
    )`,
    [requestId, createdAt]
  )
}

async function copies() {
  const { rows } = await database.pool.query<{
    request_id: string
    service_track: string
    project_id: string | null
    submission: JsonObject
    received_at: Date | null
  }>("SELECT * FROM intake_submissions")

  return rows
}

describe("findNewSubmissions", () => {
  it("returns a new Tier 1 row on Tier_1", async () => {
    await addTier1("T1-100")

    const found = await findNewSubmissions(database)

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      requestId: "T1-100",
      serviceTrack: "Tier_1",
    })
  })

  it("returns a new Tier 3 row on Tier_3", async () => {
    await addTier3("T3-100")

    const found = await findNewSubmissions(database)

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      requestId: "T3-100",
      serviceTrack: "Tier_3",
    })
  })

  it("leaves out a row that is already copied", async () => {
    await addTier1("T1-100")
    await addTier1("T1-200")

    const [first] = await findNewSubmissions(database)

    await database.transaction((transaction) =>
      copySubmission(transaction, first!)
    )

    const found = await findNewSubmissions(database)

    expect(found.map((submission) => submission.requestId)).toEqual(["T1-200"])
  })

  it("returns the rows of both tables oldest first", async () => {
    await addTier1("T1-late", new Date("2026-10-03T00:00:00Z"))
    await addTier3("T3-early", new Date("2026-10-01T00:00:00Z"))
    await addTier1("T1-middle", new Date("2026-10-02T00:00:00Z"))

    const found = await findNewSubmissions(database)

    expect(found.map((submission) => submission.requestId)).toEqual([
      "T3-early",
      "T1-middle",
      "T1-late",
    ])
  })

  it("reads the whole website row with its own column names", async () => {
    await addTier3("T3-100")

    const [submission] = await findNewSubmissions(database)

    expect(submission!.row).toMatchObject({
      request_id: "T3-100",
      contact_person: "Kofi",
      file_attachment: ["https://files.example.com/b.pdf"],
      notify_attempts: 0,
    })
  })
})

describe("copySubmission", () => {
  it("saves the whole website row as JSON with the time it arrived", async () => {
    await addTier1("T1-100")

    const [submission] = await findNewSubmissions(database)

    const copy = await database.transaction((transaction) =>
      copySubmission(transaction, submission!)
    )

    const rows = await copies()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      request_id: "T1-100",
      service_track: "Tier_1",
      project_id: null,
      submission: submission!.row,
    })
    expect(rows[0]!.received_at).toBeInstanceOf(Date)
    expect(copy.requestId).toBe("T1-100")
  })

  it("keeps the first copy when the same request is copied twice", async () => {
    await addTier1("T1-100")

    const [submission] = await findNewSubmissions(database)

    const first = await database.transaction((transaction) =>
      copySubmission(transaction, submission!)
    )

    const second = await database.transaction((transaction) =>
      copySubmission(transaction, {
        ...submission!,
        row: { ...submission!.row, contact_person: "Someone else" },
      })
    )

    const rows = await copies()

    expect(rows).toHaveLength(1)
    expect(rows[0]!.submission).toEqual(submission!.row)
    expect(second).toEqual(first)
  })
})

describe("intake_submissions", () => {
  it("refuses a second row with the same request ID", async () => {
    const insert =
      "INSERT INTO intake_submissions (request_id, service_track, submission) VALUES ('T1-100', 'Tier_1', '{}')"

    await database.pool.query(insert)

    await expect(database.pool.query(insert)).rejects.toThrow(
      /intake_submissions_request_id_unique/
    )
  })
})

// The website owns its tables. The ERM reads them and never writes to them;
// only the local copies made for development and tests are written here.
describe("website tables", () => {
  const roots = ["app", "components", "db", "lib", "scripts", "server"]

  const allowed = new Set([join("db", "website", "local.ts")])

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) {
        return sourceFiles(path)
      }

      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [path]
        : []
    })
  }

  const writes = [
    /\.(insert|update|delete)\(\s*(customEngineeringSubmissions|draftingDigitizationSubmissions)\b/,
    /\b(insert\s+into|update|delete\s+from|truncate|alter\s+table|drop\s+table)\s+(table\s+)?"?(public"?\."?)?(custom_engineering_submissions|drafting_digitization_submissions)\b/i,
  ]

  it("are never written to by ERM code", () => {
    const offenders = roots
      .flatMap(sourceFiles)
      .filter((path) => !allowed.has(path))
      .filter((path) => {
        const source = readFileSync(path, "utf8")

        return writes.some((pattern) => pattern.test(source))
      })

    expect(offenders).toEqual([])
  })
})
