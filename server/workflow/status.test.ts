import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ProjectStatus } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { registerTestTools } from "@/server/tools/testing"

import { loadWorkflow, toolStatus, workflowMaps } from "./workflow"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.8", "D1.9", "D1.16"] })

// D1.9 opens after D1.8, and D1.16 after either of them.
loadWorkflow([
  {
    workbook: "wb01",
    tools: [
      { tool: "D1.8" },
      { tool: "D1.9", after: { all: ["D1.8"] } },
      { tool: "D1.16", after: { any: ["D1.8", "D1.9"] } },
    ],
  },
  ...workflowMaps.filter((map) => map.workbook !== "wb01"),
])

let projectId: string

async function addProject(status: ProjectStatus = "active") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track, status) VALUES ('Boiler', $1, 'Tier_1', $2) RETURNING id",
    [`T1-${crypto.randomUUID()}`, status]
  )

  return rows[0]!.id
}

async function lock(toolId: string) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state) VALUES ($1, $2, 'locked')",
    [projectId, toolId]
  )
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
})

afterAll(async () => {
  await database.pool.end()
})

describe("toolStatus", () => {
  it("has the first tool open, waiting on nothing", async () => {
    expect(await toolStatus(database, projectId, "D1.8")).toEqual({
      cycle: 1,
      missing: [],
      waitingOn: [],
    })
  })

  it("names the tool a later tool waits on", async () => {
    const status = await toolStatus(database, projectId, "D1.9")

    expect(status.waitingOn).toEqual(["D1.8"])
    expect(status.missing.join(" ")).toContain("D1.8")
  })

  it("opens the tool once the one before it is locked", async () => {
    await lock("D1.8")

    expect(await toolStatus(database, projectId, "D1.9")).toMatchObject({
      missing: [],
      waitingOn: [],
    })
  })

  it("names every tool of an any-of requirement that is not locked", async () => {
    expect((await toolStatus(database, projectId, "D1.16")).waitingOn).toEqual([
      "D1.8",
      "D1.9",
    ])
  })

  it("waits on nothing when the reason is not an earlier tool", async () => {
    const closed = await addProject("closed")

    const status = await toolStatus(database, closed, "D1.8")

    expect(status.waitingOn).toEqual([])
    expect(status.missing.join(" ")).toContain("closed")
  })
})
