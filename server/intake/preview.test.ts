import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport } from "@/server/email/email"

import { pullNewRequests } from "./intake"
import { getClientRequestPreview } from "./preview"
import { createIntakeFixtures, link, registerD11 } from "./testing"

const database = createTestDatabase()

registerD11()

const { addTier1, addTier3, addPerson, addItAdmin } =
  createIntakeFixtures(database)

async function pull() {
  await pullNewRequests(database, {
    baseURL: "https://erm.example.com",
    transport: createFakeTransport(),
  })
}

async function projectOf(requestId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM projects WHERE request_id = $1",
    [requestId]
  )

  return rows[0]!.id
}

async function addToProject(projectId: string, role: string) {
  const person = await addPerson(role)

  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [person.id, projectId, role]
  )

  return person.id
}

async function copyOf(requestId: string) {
  const { rows } = await database.pool.query(
    "SELECT * FROM intake_submissions WHERE request_id = $1",
    [requestId]
  )

  return rows[0]
}

type Preview = Awaited<ReturnType<typeof getClientRequestPreview>>

function groupsOf(preview: Preview) {
  return preview?.groups.map((group) => group.title)
}

function answer(preview: Preview, label: string) {
  return preview?.groups
    .flatMap((group) => group.rows)
    .find((row) => row.label === label)?.value
}

const internal = [
  "Custom engineering id",
  "Drafting digitization id",
  "Updated at",
  "Admin notified at",
  "Confirmation sent at",
  "Notify attempts",
  "File attachments",
  "File attachment",
]

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("getClientRequestPreview", () => {
  it("shows a Tier 1 request's answers, each with a label", async () => {
    await addTier1({ requestId: "T1-1", organisation: "Acme", title: "Belt" })
    await pull()

    const projectId = await projectOf("T1-1")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(preview?.requestId).toBe("T1-1")
    expect(preview?.track).toBe("Tier_1")
    expect(answer(preview, "Organisation")).toBe("Acme")
    expect(answer(preview, "Title")).toBe("Belt")
    expect(answer(preview, "Primary objective")).toBe("Move boxes")
  })

  it("groups a Tier 1 request as contact, project and systems", async () => {
    await addTier1({ requestId: "T1-g" })
    await pull()

    const projectId = await projectOf("T1-g")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(groupsOf(preview)).toEqual([
      "Contact",
      "Project",
      "Systems",
      "Submission",
    ])
  })

  it("groups a Tier 3 request as contact, source asset and drafting", async () => {
    await addTier3({ requestId: "T3-g" })
    await pull()

    const projectId = await projectOf("T3-g")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(groupsOf(preview)).toEqual([
      "Contact",
      "Source asset",
      "Drafting",
      "Submission",
    ])
    expect(answer(preview, "Input material type")).toBe("Paper drawings")
    expect(answer(preview, "Condition")).toBe("Good")
    expect(answer(preview, "Output formats")).toBe("DWG")
  })

  it("shows when it was received and when the terms were accepted", async () => {
    await addTier1({
      requestId: "T1-s",
      createdAt: new Date("2026-11-03T09:14:00Z"),
    })
    await pull()

    const projectId = await projectOf("T1-s")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(answer(preview, "Received")).toBe("3 Nov 2026, 09:14 UTC")
    expect(answer(preview, "Terms accepted")).toBe("3 Nov 2026, 09:14 UTC")
  })

  it("shows a Tier 3 request's answers", async () => {
    await addTier3({ requestId: "T3-1", organisation: "Aquaresh" })
    await pull()

    const projectId = await projectOf("T3-1")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(preview?.track).toBe("Tier_3")
    expect(answer(preview, "Organisation")).toBe("Aquaresh")
    expect(answer(preview, "Standard")).toBe("ISO")
  })

  it("shows a list answer as a comma-separated list", async () => {
    await addTier3({ requestId: "T3-2" })
    await pull()

    const projectId = await projectOf("T3-2")
    const om = await addToProject(projectId, "OM")

    await database.pool.query(
      `UPDATE intake_submissions
       SET submission = jsonb_set(submission, '{drafting_services}', '["2D drafting","3D modelling"]')
       WHERE request_id = 'T3-2'`
    )

    const preview = await getClientRequestPreview(database, om, projectId)

    expect(answer(preview, "Services")).toBe("2D drafting, 3D modelling")
  })

  it("keeps a column the website adds later, under other answers", async () => {
    await addTier1({ requestId: "T1-2" })
    await pull()

    const projectId = await projectOf("T1-2")
    const om = await addToProject(projectId, "OM")

    await database.pool.query(
      `UPDATE intake_submissions
       SET submission = submission || '{"extra_question": "Yes please"}'
       WHERE request_id = 'T1-2'`
    )

    const preview = await getClientRequestPreview(database, om, projectId)

    const other = preview?.groups.find(
      (group) => group.title === "Other answers"
    )

    expect(other?.rows).toEqual([
      { label: "Extra question", value: "Yes please" },
    ])
  })

  it("has no other answers group when every column is known", async () => {
    await addTier1({ requestId: "T1-o" })
    await pull()

    const projectId = await projectOf("T1-o")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(groupsOf(preview)).not.toContain("Other answers")
  })

  it("leaves an empty answer empty, which the panel shows as not given", async () => {
    await addTier1({ requestId: "T1-3" })
    await pull()

    const projectId = await projectOf("T1-3")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(answer(preview, "By-products")).toBe("")
  })

  it("hides the internal columns", async () => {
    await addTier1({ requestId: "T1-4" })
    await pull()

    const projectId = await projectOf("T1-4")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    const labels = preview!.groups.flatMap((group) =>
      group.rows.map((row) => row.label)
    )

    for (const label of internal) {
      expect(labels).not.toContain(label)
    }
  })

  it("never puts the uploaded files in the preview", async () => {
    await addTier1({ requestId: "T1-5", files: [link("secret-key")] })
    await pull()

    const projectId = await projectOf("T1-5")
    const om = await addToProject(projectId, "OM")
    const preview = await getClientRequestPreview(database, om, projectId)

    expect(JSON.stringify(preview)).not.toContain("secret-key")
  })

  it("gives it to every role that may read D1.1, and to a company-wide IT/Admin", async () => {
    await addTier1({ requestId: "T1-6" })
    await pull()

    const projectId = await projectOf("T1-6")
    const admin = await addItAdmin("Admin")

    for (const role of ["Client", "PM", "OM", "CR"]) {
      const person = await addToProject(projectId, role)

      expect(
        await getClientRequestPreview(database, person, projectId)
      ).not.toBeNull()
    }

    expect(
      await getClientRequestPreview(database, admin.id, projectId)
    ).not.toBeNull()
  })

  it("gives nothing to a person outside the project", async () => {
    await addTier1({ requestId: "T1-7" })
    await addTier1({ requestId: "T1-8" })
    await pull()

    const other = await addToProject(await projectOf("T1-8"), "OM")
    const stranger = await addPerson("Stranger")

    expect(
      await getClientRequestPreview(database, other, await projectOf("T1-7"))
    ).toBeNull()
    expect(
      await getClientRequestPreview(
        database,
        stranger.id,
        await projectOf("T1-7")
      )
    ).toBeNull()
  })

  it("gives nothing to a role that may not read D1.1", async () => {
    await addTier1({ requestId: "T1-9" })
    await pull()

    const projectId = await projectOf("T1-9")

    for (const role of ["LE", "CA"]) {
      const person = await addToProject(projectId, role)

      expect(
        await getClientRequestPreview(database, person, projectId)
      ).toBeNull()
    }
  })

  it("gives nothing for a project with no saved copy", async () => {
    const { rows } = await database.pool.query<{ id: string }>(
      `INSERT INTO projects (name, request_id, service_track)
       VALUES ('Manual', 'MANUAL-1', 'Tier_1') RETURNING id`
    )

    const om = await addToProject(rows[0]!.id, "OM")

    expect(await getClientRequestPreview(database, om, rows[0]!.id)).toBeNull()
  })

  it("answers the same for a project that does not exist as for one that is hidden", async () => {
    const stranger = await addPerson("Stranger")

    expect(
      await getClientRequestPreview(database, stranger.id, crypto.randomUUID())
    ).toBeNull()
  })

  it("never changes the saved copy", async () => {
    await addTier1({ requestId: "T1-10" })
    await pull()

    const projectId = await projectOf("T1-10")
    const om = await addToProject(projectId, "OM")
    const before = await copyOf("T1-10")

    await getClientRequestPreview(database, om, projectId)
    await getClientRequestPreview(database, om, projectId)

    expect(await copyOf("T1-10")).toEqual(before)
  })
})
