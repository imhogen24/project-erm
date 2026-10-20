import { afterAll, describe, expect, it } from "vitest"

import { createTestDatabase, resetTestData } from "./testing"

const database = createTestDatabase()

afterAll(async () => {
  await database.pool.end()
})

describe("test database", () => {
  it("connects to erm_test", async () => {
    const { rows } = await database.pool.query<{ name: string }>(
      "SELECT current_database() AS name"
    )

    expect(rows[0]?.name).toBe("erm_test")
  })

  it("resets without error when there are no tables", async () => {
    await expect(resetTestData(database)).resolves.toBeUndefined()
  })
})
