import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { fileReference } from "@/lib/file-reference"
import { createRecord } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { FileNotFoundError, fileLinkFor } from "./files"
import type { Storages } from "./storage"

const database = createTestDatabase()

// D1.1 as the intake fills it: the client's files are rows of a table, each
// holding the link the website saved. A field of its own holds one more.
tools.registerTool(
  defineTool({
    id: "D1.1",
    name: "Client Email / Web Form",
    workbook: "wb01",
    fields: [
      { key: "brief", label: "Brief", type: "fileLink" },
      {
        key: "attachedFiles",
        label: "Attached files",
        type: "table",
        columns: [
          { key: "label", label: "Label", type: "text" },
          { key: "link", label: "Link", type: "fileLink" },
        ],
      },
    ],
  })
)

const first = "https://utfs.io/f/first-key"

const second = "https://utfs.io/f/second-key"

const brief = "https://utfs.io/f/brief-key"

let projectId: string

// Holds every role, the Client too since only the client writes D1.1, so
// permissions never get in the way of building records.
let actor: string

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, 'Tier_1') RETURNING id",
    [`T1-${crypto.randomUUID()}`]
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

async function addRecord(payload: JsonObject, on = projectId, by = actor) {
  const record = await createRecord(database, by, {
    projectId: on,
    toolId: "D1.1",
    payload,
  })

  return record.id
}

function filesPayload(...links: string[]): JsonObject {
  return {
    attachedFiles: links.map((link, index) => ({
      label: `File ${index + 1}`,
      link,
    })),
  }
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  actor = await addPerson("Everyone", ["Client", "PM", "OM", "IT/Admin"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("opening a file on a record", () => {
  it("gives a person who may read the record the stored link", async () => {
    const recordId = await addRecord(filesPayload(first, second))
    const om = await addPerson("Olu", ["OM"])

    await expect(fileLinkFor(database, om, recordId, second)).resolves.toBe(
      second
    )
  })

  it("finds a link in a field of its own, not only in a table", async () => {
    const recordId = await addRecord({ brief })
    const pm = await addPerson("Pat", ["PM"])

    await expect(fileLinkFor(database, pm, recordId, brief)).resolves.toBe(
      brief
    )
  })

  it("refuses a person whose roles cannot read the record", async () => {
    const recordId = await addRecord(filesPayload(first))
    const finance = await addPerson("Fay", ["FO"])

    await expect(
      fileLinkFor(database, finance, recordId, first)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("refuses a person of another project", async () => {
    const recordId = await addRecord(filesPayload(first))
    const elsewhere = await addPerson("Ola", ["OM", "PM"], await addProject())

    await expect(
      fileLinkFor(database, elsewhere, recordId, first)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("refuses a link that is on another record", async () => {
    const recordId = await addRecord(filesPayload(first))
    const other = await addProject()

    await addRecord(
      filesPayload(second),
      other,
      await addPerson("Ola", ["Client"], other)
    )

    await expect(
      fileLinkFor(database, actor, recordId, second)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("never sends a person to an address that is not stored", async () => {
    const recordId = await addRecord(filesPayload(first))

    for (const address of [
      "https://evil.example.com/",
      `${first}/../other`,
      "https://utfs.io/f/",
      "",
    ]) {
      await expect(
        fileLinkFor(database, actor, recordId, address)
      ).rejects.toBeInstanceOf(FileNotFoundError)
    }
  })

  it("refuses a stored value that is not an https link", async () => {
    const plain = "http://utfs.io/f/plain-key"
    const recordId = await addRecord(filesPayload(plain))

    await expect(
      fileLinkFor(database, actor, recordId, plain)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("does not count a text cell that holds a link", async () => {
    const recordId = await addRecord({
      attachedFiles: [{ label: first, link: second }],
    })

    await expect(
      fileLinkFor(database, actor, recordId, first)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("answers a hidden record exactly as one that does not exist", async () => {
    const recordId = await addRecord(filesPayload(first))
    const finance = await addPerson("Fay", ["FO"])

    const answer = new FileNotFoundError()

    await expect(
      fileLinkFor(database, finance, recordId, first)
    ).rejects.toStrictEqual(answer)

    await expect(
      fileLinkFor(database, finance, crypto.randomUUID(), first)
    ).rejects.toStrictEqual(answer)
  })

  it("refuses a record id that cannot be a record", async () => {
    await expect(
      fileLinkFor(database, actor, "not-a-uuid", first)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })
})

describe("opening a file uploaded in the ERM", () => {
  // Stands in for UploadThing: a link that names the key it was made for.
  const fakeStorage: Storages = {
    uploadthing: {
      signedLink: async (key) => `https://signed.example/${key}?expires=300`,
    },
  }

  async function uploaded(on: string | null) {
    const { rows } = await database.pool.query<{ id: string }>(
      "INSERT INTO files (storage, key, name, size, content_type, uploaded_by, project_id) VALUES ('uploadthing', $1, 'nameplate.jpg', 2048, 'image/jpeg', $2, $3) RETURNING id",
      [`key-${crypto.randomUUID()}`, actor, on]
    )

    return fileReference(rows[0]!.id)
  }

  async function keyOf(reference: string) {
    const { rows } = await database.pool.query<{ key: string }>(
      "SELECT key FROM files WHERE id = $1",
      [reference.slice("file:".length)]
    )

    return rows[0]!.key
  }

  it("gives a fresh signed link for the file's key", async () => {
    const reference = await uploaded(projectId)
    const recordId = await addRecord(filesPayload(reference))
    const om = await addPerson("Olu", ["OM"])

    await expect(
      fileLinkFor(database, om, recordId, reference, fakeStorage)
    ).resolves.toBe(
      `https://signed.example/${await keyOf(reference)}?expires=300`
    )
  })

  it("refuses a file sent with another project, even if a record names it", async () => {
    const reference = await uploaded(await addProject())
    const recordId = await addRecord(filesPayload(reference))

    await expect(
      fileLinkFor(database, actor, recordId, reference, fakeStorage)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("refuses a file never sent with a request", async () => {
    const reference = await uploaded(null)
    const recordId = await addRecord(filesPayload(reference))

    await expect(
      fileLinkFor(database, actor, recordId, reference, fakeStorage)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("refuses a file the record does not hold", async () => {
    const reference = await uploaded(projectId)
    const recordId = await addRecord(filesPayload(first))

    await expect(
      fileLinkFor(database, actor, recordId, reference, fakeStorage)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })

  it("refuses a person who may not read the record", async () => {
    const reference = await uploaded(projectId)
    const recordId = await addRecord(filesPayload(reference))
    const stranger = await addPerson("Yaw", [])

    await expect(
      fileLinkFor(database, stranger, recordId, reference, fakeStorage)
    ).rejects.toBeInstanceOf(FileNotFoundError)
  })
})
