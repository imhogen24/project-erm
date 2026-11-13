import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"
import {
  availableTools,
  loadWorkflow,
  workflowMaps,
} from "@/server/workflow/workflow"

import { registerAllTools } from "../index"

// The real WB01 map and tools, with D2.1 standing in for WB02's first tool.
const database = createTestDatabase()

registerAllTools(tools)

registerTestTools({ wb02: ["D2.1"] })

loadWorkflow(workflowMaps)

async function addProject(name: string, track: ServiceTrack) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    [name, `T-${crypto.randomUUID()}`, track]
  )

  return rows[0]!.id
}

async function open(projectId: string) {
  return (await availableTools(database, projectId)).map((tool) => tool.toolId)
}

beforeEach(async () => {
  await resetTestData(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("a Dev: All Tools Unlocked project, in development", () => {
  it("opens every Tier 1 tool of WB01 at once, and no Tier 3 tool or WB02", async () => {
    const tools = await open(
      await addProject(`${DEV_UNLOCKED} (Tier 1)`, "Tier_1")
    )

    expect(tools).toEqual(
      expect.arrayContaining(["D1.1", "D1.3", "D1.5", "D1.7", "D1.8", "D1.16"])
    )
    expect(tools).not.toContain("T3.D1.8a")
    expect(tools).not.toContain("D2.1")
  })

  it("opens the Tier 3 tools on a Tier 3 one, and none it skips", async () => {
    const tools = await open(
      await addProject(`${DEV_UNLOCKED} (Tier 3)`, "Tier_3")
    )

    expect(tools).toEqual(
      expect.arrayContaining(["T3.D1.3a", "D1.4", "T3.D1.8a"])
    )
    expect(tools).not.toContain("D1.5")
  })

  it("leaves any other project waiting, as always", async () => {
    expect(await open(await addProject("Tema Foods", "Tier_1"))).toEqual([
      "D1.1",
    ])
  })
})
