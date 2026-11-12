import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { fileReference } from "@/lib/file-reference"
import { FileNotFoundError, fileLinkFor } from "@/server/files/files"
import type { Storages } from "@/server/files/storage"
import { recordUpload } from "@/server/files/uploads"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ValidationError,
  approveRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { t3d18a } from "./t3-d1-8a"

const database = createTestDatabase()

tools.registerTool(t3d18a)

loadUnorderedWorkflow({ wb01: ["T3.D1.8a"] })

// Stands in for UploadThing: a link that names the key it was made for.
const fakeStorage: Storages = {
  uploadthing: {
    signedLink: async (key) => `https://signed.example/${key}`,
  },
}

let projectId: string

let ae: string

let le: string

let qa: string

// A log ready to submit.
const complete = {
  equipment: [{ tool: "Tape Measure", accuracy: "Trusted supplier (Tolsen)" }],
  dimensions: [
    {
      feature: "Sketched outline of trailer",
      method: "Tape Measure",
      value: "4200 x 1800",
      confidence: "Medium",
    },
  ],
  photos: [{ view: "All views", captured: "Yes" }],
}

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tarkwa Pump Station', $1, 'Tier_3') RETURNING id",
    [`T3-${Math.round(Math.random() * 1e12)}`]
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

async function addLog(payload: JsonObject = complete) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'T3.D1.8a', 'draft', $2) RETURNING id",
    [projectId, payload]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  ae = await addPerson("Adwoa Baffoe", ["AE"])
  le = await addPerson("Yaa Sarpong", ["LE"])
  qa = await addPerson("Kofi Mensah", ["QA"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("submitting and approving the log", () => {
  it("the AE signs and submits, and the LE's approval locks it", async () => {
    const id = await addLog()

    await signField(database, ae, id, "leadMeasurerSignature")
    await submitRecord(database, ae, id)

    const locked = await approveRecord(database, le, id)

    expect(locked.state).toBe("locked")
  })

  it("needs a measured value and a confidence on every dimension", async () => {
    const id = await addLog({
      ...complete,
      dimensions: [{ feature: "Outline", method: "Tape Measure" }],
    })

    await expect(submitRecord(database, ae, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("needs at least the equipment, a dimension and a photo row", async () => {
    const id = await addLog({})

    await expect(submitRecord(database, ae, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("only the AE signs as Lead Measurer", async () => {
    const id = await addLog()

    await expect(
      signField(database, le, id, "leadMeasurerSignature")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("the LE cannot approve it until the AE has signed", async () => {
    const id = await addLog()

    await submitRecord(database, ae, id)

    await expect(approveRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })
})

describe("photos uploaded into the ERM", () => {
  async function uploadPhoto() {
    return recordUpload(
      database,
      ae,
      {
        key: `photo-${crypto.randomUUID()}`,
        name: "outline.jpg",
        size: 2048,
        contentType: "image/jpeg",
      },
      projectId
    )
  }

  it("belong to the project from the upload", async () => {
    const photo = await uploadPhoto()

    const { rows } = await database.pool.query<{ project_id: string }>(
      "SELECT project_id FROM files WHERE id = $1",
      [photo.id]
    )

    expect(rows[0]!.project_id).toBe(projectId)
  })

  it("open from the log for anyone who may read it", async () => {
    const photo = await uploadPhoto()
    const reference = fileReference(photo.id)

    const id = await addLog({
      ...complete,
      photos: [{ view: "All views", captured: "Yes", file: reference }],
    })

    await expect(
      fileLinkFor(database, qa, id, reference, fakeStorage)
    ).resolves.toMatch(/^https:\/\/signed\.example\/photo-/)
  })

  it("never open through a log that does not hold them", async () => {
    const photo = await uploadPhoto()
    const id = await addLog()

    await expect(
      fileLinkFor(database, le, id, fileReference(photo.id), fakeStorage)
    ).rejects.toThrow(FileNotFoundError)
  })
})
