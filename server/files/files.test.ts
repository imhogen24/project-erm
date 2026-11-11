import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { createRecord } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { FileNotFoundError, fileLinkFor } from "./files"

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
