import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "@/db/testing"

import { recordUpload } from "./uploads"

const database = createTestDatabase()

async function addClient(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email, email_verified, account_type) VALUES ($1, $2, true, 'client') RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  return rows[0]!.id
}

const upload = {
  key: "abc123-nameplate.jpg",
  name: "nameplate.jpg",
  size: 2048,
  contentType: "image/jpeg",
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("recordUpload", () => {
  it("saves the file for the person, on no project yet", async () => {
    const client = await addClient("Kwaku")
    const saved = await recordUpload(database, client, upload)

    const { rows } = await database.pool.query(
      "SELECT storage, key, name, size, content_type, uploaded_by, project_id FROM files WHERE id = $1",
      [saved.id]
    )

    expect(rows[0]).toEqual({
      storage: "uploadthing",
      key: upload.key,
      name: "nameplate.jpg",
      size: "2048",
      content_type: "image/jpeg",
      uploaded_by: client,
      project_id: null,
    })
  })

  it("returns the same file when the storage reports an upload twice", async () => {
    const client = await addClient("Kwaku")
    const first = await recordUpload(database, client, upload)

    await expect(recordUpload(database, client, upload)).resolves.toEqual(first)
  })

  it("never hands one person's upload to another", async () => {
    await recordUpload(database, await addClient("Kwaku"), upload)

    await expect(
      recordUpload(database, await addClient("Esi"), upload)
    ).rejects.toThrow()
  })
})
