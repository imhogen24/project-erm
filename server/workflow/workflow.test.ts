import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  roles,
  type JsonObject,
  type Role,
  type ServiceTrack,
} from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  ToolNotAvailableError,
  createRecord,
  getRecord,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "@/server/records/records"
import { rollBackWorkbook } from "@/server/rollbacks/rollbacks"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"

import { brokenWorkflowRules } from "./check"
import type { ToolRule, WorkbookMap } from "./map"
import {
  WorkflowMapError,
  availableTools,
  loadWorkflow,
  workflowMaps,
} from "./workflow"

const database = createTestDatabase()

// D3.1 sets how many payment milestones there are, as a number or as one
// schedule row per milestone.
tools.registerTool(
  defineTool({
    id: "D3.1",
    name: "Test D3.1",
    workbook: "wb03",
    fields: [
      { key: "milestones", label: "Milestones", type: "number" },
      {
        key: "schedule",
        label: "Schedule",
        type: "table",
        columns: [{ key: "amount", label: "Amount", type: "currency" }],
      },
      { key: "note", label: "Note", type: "text" },
    ],
  })
)

// D1.3 has a decision, so a rule can read it.
tools.registerTool(
  defineTool({
    id: "D1.3",
    name: "Test D1.3",
    workbook: "wb01",
    fields: [
      { key: "note", label: "Note", type: "text" },
      {
        key: "decision",
        label: "Decision",
        type: "select",
        options: ["Go", "Stop"],
      },
    ],
  })
)

// The tools are picked so that `actor` can write and lock each one.
registerTestTools({
  wb01: ["D1.3", "D1.4", "D1.5", "D1.16"],
  wb02: ["D2.12", "D2.14"],
  wb03: ["D3.4", "D3.5", "D3.10"],
  wb04: ["D4.1", "D4.8"],
  wb05: ["P5.2"],
  wb06: ["P6"],
})

// A short route through five workbooks. In WB03, D3.4, D3.5 and D3.10 run once
// per payment milestone, and a cycle closes when its D3.10 is locked.
const testMaps: WorkbookMap[] = [
  {
    workbook: "wb01",
    tools: [
      { tool: "D1.3" },
      { tool: "D1.4" },
      { tool: "D1.5", after: { any: ["D1.3", "D1.4"] } },
      { tool: "D1.16" },
    ],
  },
  {
    workbook: "wb02",
    opens: { after: { all: ["D1.16"] } },
    tools: [{ tool: "D2.14" }, { tool: "D2.12", after: { all: ["D2.14"] } }],
  },
  {
    workbook: "wb03",
    opens: { after: { all: ["D2.12"] } },
    cycles: { count: { tool: "D3.1", field: "milestones" }, closedBy: "D3.10" },
    tools: [
      { tool: "D3.1" },
      { tool: "D3.4", after: { all: ["D3.1"] }, repeats: true },
      { tool: "D3.5", after: { all: ["D3.1"] }, repeats: true },
      { tool: "D3.10", after: { all: ["D3.5"] }, repeats: true },
    ],
  },
  { workbook: "wb04", opens: { after: { all: ["D3.10"] } }, tools: [] },
  {
    workbook: "wb05",
    opens: { after: { all: ["D4.8"] }, tracks: ["Tier_1"] },
    tools: [],
  },
]

let projectId: string

// Holds every role, so permissions never get in the way of the route.
let actor: string

async function addProject(name: string, track: ServiceTrack = "Tier_1") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    [name, `T1-${crypto.randomUUID()}`, track]
  )

  return rows[0]!.id
}

async function giveRoles(
  person: string,
  project: string,
  held: readonly Role[]
) {
  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [person, project, role]
    )
  }
}

async function addActor(project: string, held: readonly Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`ama-${Math.random()}@example.com`]
  )

  await giveRoles(rows[0]!.id, project, held)

  return rows[0]!.id
}

type Options = { cycle?: number; payload?: JsonObject; project?: string }

// Creates a record of `toolId` and walks it forward to `state`.
async function recordIn(
  state: RecordState,
  toolId: string,
  { cycle, payload, project = projectId }: Options = {}
) {
  const record = await createRecord(database, actor, {
    projectId: project,
    toolId,
    cycle,
    payload,
  })

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  return record
}

// What is locked, in order, to open each workbook.
const opening: [string, JsonObject?][] = [
  ["D1.16"],
  ["D2.14"],
  ["D2.12"],
  ["D3.1", { milestones: 2 }],
  ["D3.5"],
  ["D3.10"],
  ["D4.8"],
]

// How many of `opening` are locked once each workbook is open, by workbook
// number.
const openedBy = [0, 0, 1, 3, 6, 7]

// Locks what it takes to open `workbook`, starting from `from` being open.
async function openWorkbook(
  workbook: number,
  { from = 1, milestones = 2, project = projectId } = {}
) {
  for (const [toolId, payload] of opening.slice(
    openedBy[from],
    openedBy[workbook]
  )) {
    await recordIn("locked", toolId, {
      payload: toolId === "D3.1" ? { milestones } : payload,
      project,
    })
  }
}

// The open tools whose id starts with `prefix`, as "D3.5@2" for cycle 2.
async function open(prefix = "", project = projectId) {
  return (await availableTools(database, project))
    .map((tool) => `${tool.toolId}@${tool.cycle}`)
    .filter((tool) => tool.startsWith(prefix))
    .sort()
}

async function countRecords(toolId: string) {
  const { rows } = await database.pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM tool_records WHERE tool_id = $1",
    [toolId]
  )

  return Number(rows[0]!.n)
}

beforeEach(async () => {
  await resetTestData(database)

  loadWorkflow(testMaps)

  projectId = await addProject("Boiler")
  actor = await addActor(projectId, roles)
})

afterAll(async () => {
  await database.pool.end()
})

describe("opening a workbook", () => {
  it("refuses a tool of a closed workbook, and adds nothing", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.14" })
    ).rejects.toBeInstanceOf(ToolNotAvailableError)
    expect(await countRecords("D2.14")).toBe(0)
  })

  for (const state of ["draft", "submitted", "approved"] as const) {
    it(`keeps it closed while the opening record is only ${state}`, async () => {
      await recordIn(state, "D1.16")

      await expect(
        createRecord(database, actor, { projectId, toolId: "D2.14" })
      ).rejects.toBeInstanceOf(ToolNotAvailableError)
    })
  }

  it("opens it once the opening record is locked", async () => {
    await recordIn("locked", "D1.16")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D2.14",
    })

    expect(record.toolId).toBe("D2.14")
  })

  it("does not count a locked record from another project", async () => {
    const other = await addProject("Conveyor")

    await giveRoles(actor, other, roles)
    await recordIn("locked", "D1.16", { project: other })

    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.14" })
    ).rejects.toBeInstanceOf(ToolNotAvailableError)
  })

  it("does not count a locked record of a different tool", async () => {
    await recordIn("locked", "D1.3")

    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.14" })
    ).rejects.toBeInstanceOf(ToolNotAvailableError)
  })

  it("names the opening tool in the error", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.14" })
    ).rejects.toThrow(/D1\.16 is not locked/)
  })

  it.each([
    [2, "D2.14"],
    [3, "D3.1"],
    [4, "D4.1"],
    [5, "P5.2"],
  ])(
    "keeps workbook %i closed until the one before it is done",
    async (workbook, toolId) => {
      await openWorkbook(workbook - 1)

      await expect(
        createRecord(database, actor, { projectId, toolId })
      ).rejects.toBeInstanceOf(ToolNotAvailableError)

      await openWorkbook(workbook, { from: workbook - 1 })

      expect(await open()).toContain(`${toolId}@1`)
    }
  )

  it("lets Tier 3 projects skip WB05", async () => {
    projectId = await addProject("Kiln", "Tier_3")
    await giveRoles(actor, projectId, roles)
    await openWorkbook(5)

    expect(await open("P5.")).toEqual([])
    await expect(
      createRecord(database, actor, { projectId, toolId: "P5.2" })
    ).rejects.toThrow(/Tier_3 projects skip wb05/)
  })

  it("opens a workbook with no rules yet all at once", async () => {
    await openWorkbook(4)

    expect(await open("D4.")).toEqual(["D4.1@1", "D4.8@1"])
  })

  it("never opens a workbook with no map", async () => {
    await openWorkbook(5)

    expect(await open("P6")).toEqual([])
    await expect(
      createRecord(database, actor, { projectId, toolId: "P6" })
    ).rejects.toThrow(/wb06 has no workflow map/)
  })
})

describe("the order inside a workbook", () => {
  it("opens a tool that waits for any one of two once either is locked", async () => {
    expect(await open()).toEqual(["D1.16@1", "D1.3@1", "D1.4@1"])

    await recordIn("locked", "D1.4")

    expect(await open()).toEqual(["D1.16@1", "D1.3@1", "D1.5@1"])
  })

  it("names every tool when none of them is locked", async () => {
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.5" })
    ).rejects.toThrow(/none of D1\.3, D1\.4 is locked/)
  })

  describe("a condition on one tool of an any", () => {
    beforeEach(() => {
      loadWorkflow(
        testMaps.map((map) =>
          map.workbook === "wb01"
            ? {
                ...map,
                tools: map.tools.map((rule) =>
                  rule.tool === "D1.5"
                    ? {
                        ...rule,
                        when: {
                          tool: "D1.3",
                          field: "decision",
                          oneOf: ["Go"],
                        },
                      }
                    : rule
                ),
              }
            : map
        )
      )
    })

    it("keeps the tool closed when the other tool is locked and the condition's tool is not", async () => {
      await recordIn("locked", "D1.4")

      expect(await open("D1.5")).toEqual([])
      await expect(
        createRecord(database, actor, { projectId, toolId: "D1.5" })
      ).rejects.toThrow(/D1\.3 is not locked with decision "Go"/)
    })

    it("keeps it closed when the condition's tool is locked with another answer", async () => {
      await recordIn("locked", "D1.4")
      await recordIn("locked", "D1.3", { payload: { decision: "Stop" } })

      expect(await open("D1.5")).toEqual([])
    })

    it("opens it once the condition's tool is locked with the answer", async () => {
      await recordIn("locked", "D1.3", { payload: { decision: "Go" } })

      expect(await open("D1.5")).toEqual(["D1.5@1"])
    })
  })

  it("lets a started record be edited and moved after what opened it is reopened", async () => {
    await recordIn("locked", "D1.16")

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D2.14",
    })

    // The audit log keeps every record, so the opener is reopened by moving it
    // back to draft instead of deleting it.
    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE tool_id = 'D1.16'"
    )

    await updateRecord(database, actor, record.id, { note: "changed" })
    await transitionRecord(database, actor, record.id, "submitted")

    expect((await getRecord(database, actor, record.id)).state).toBe(
      "submitted"
    )
  })

  it("reports missing permission before a closed tool", async () => {
    const client = await addActor(projectId, ["Client"])

    await expect(
      createRecord(database, client, { projectId, toolId: "D2.14" })
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("opens nothing on a project that is not active", async () => {
    await database.pool.query(
      "UPDATE projects SET status = 'on_hold' WHERE id = $1",
      [projectId]
    )

    expect(await open()).toEqual([])
  })
})

describe("the executed contract", () => {
  async function approvedContract() {
    await openWorkbook(2)
    await recordIn("locked", "D2.14")

    return recordIn("approved", "D2.12")
  }

  it("keeps the finance tools closed until it is locked", async () => {
    const contract = await approvedContract()

    expect(await open("D3.")).toEqual([])

    await transitionRecord(database, actor, contract.id, "locked")

    expect(await open("D3.")).toEqual(["D3.1@1"])
  })

  it("lets the Project Manager lock it", async () => {
    const contract = await approvedContract()
    const pm = await addActor(projectId, ["PM"])

    const locked = await transitionRecord(database, pm, contract.id, "locked")

    expect(locked.state).toBe("locked")
  })

  it("does not let the Contract Administrator lock it", async () => {
    const contract = await approvedContract()
    const ca = await addActor(projectId, ["CA"])

    await expect(
      transitionRecord(database, ca, contract.id, "locked")
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})

describe("payment milestone cycles", () => {
  it("starts the repeating tools in cycle 1 once D3.1 is locked", async () => {
    await openWorkbook(3)

    expect(await open("D3.")).toEqual(["D3.1@1"])

    await recordIn("locked", "D3.1", { payload: { milestones: 2 } })

    expect(await open("D3.")).toEqual(["D3.4@1", "D3.5@1"])
  })

  it("opens cycle 2 and WB04 once D3.10 of cycle 1 is locked", async () => {
    await openWorkbook(4)

    expect(await open("D3.")).toEqual(["D3.4@1", "D3.5@2"])
    expect(await open("D4.")).toEqual(["D4.1@1", "D4.8@1"])

    const record = await createRecord(database, actor, {
      projectId,
      toolId: "D3.5",
    })

    expect(record.cycle).toBe(2)
  })

  it("keeps cycle 2 and WB04 closed until D3.10 of cycle 1 is locked", async () => {
    await openWorkbook(3)
    await recordIn("locked", "D3.1", { payload: { milestones: 2 } })
    await recordIn("locked", "D3.5")
    await recordIn("approved", "D3.10")

    expect(await open("D3.")).toEqual(["D3.4@1"])
    expect(await open("D4.")).toEqual([])
    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.5", cycle: 2 })
    ).rejects.toThrow(/D3\.10 of cycle 1 is not locked/)
  })

  it("waits for the tools of its own cycle", async () => {
    await openWorkbook(4)

    // D3.5 of cycle 1 is locked, but D3.10 of cycle 2 waits for D3.5 of cycle 2.
    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.10" })
    ).rejects.toThrow(/D3\.5 of cycle 2 is not locked/)
  })

  it("refuses a second record of a tool in the same cycle", async () => {
    await openWorkbook(3)
    await recordIn("locked", "D3.1", { payload: { milestones: 2 } })
    await recordIn("draft", "D3.4")

    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.4", cycle: 1 })
    ).rejects.toThrow(/D3\.4 already has a record in cycle 1/)
    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.4" })
    ).rejects.toBeInstanceOf(ToolNotAvailableError)
    expect(await countRecords("D3.4")).toBe(1)
  })

  it("has no cycle after the last payment milestone", async () => {
    await openWorkbook(4, { milestones: 1 })

    expect(await open("D3.")).toEqual(["D3.4@1"])
    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.5" })
    ).rejects.toThrow(/D3\.1 sets 1 payment milestone, so there is no cycle 2/)
  })

  it("counts the milestones from the rows of a table", async () => {
    loadWorkflow(
      testMaps.map((map) =>
        map.workbook === "wb03"
          ? {
              ...map,
              cycles: {
                count: { tool: "D3.1", field: "schedule" },
                closedBy: "D3.10",
              },
            }
          : map
      )
    )
    await openWorkbook(3)
    await recordIn("locked", "D3.1", {
      payload: {
        schedule: [{ amount: 100 }, { amount: 200 }, { amount: 300 }],
      },
    })

    for (const cycle of [1, 2]) {
      await recordIn("locked", "D3.5", { cycle })
      await recordIn("locked", "D3.10", { cycle })
    }

    expect(await open("D3.5")).toEqual(["D3.5@3"])

    await recordIn("locked", "D3.5", { cycle: 3 })
    await recordIn("locked", "D3.10", { cycle: 3 })

    expect(await open("D3.5")).toEqual([])
  })

  it("keeps a tool that does not repeat in cycle 1", async () => {
    await openWorkbook(3)

    await expect(
      createRecord(database, actor, { projectId, toolId: "D3.1", cycle: 2 })
    ).rejects.toThrow(/D3\.1 does not repeat/)
  })
})

describe("two creates at once", () => {
  it("lets exactly one of two simultaneous creates through", async () => {
    await recordIn("locked", "D1.16")

    const results = await Promise.allSettled([
      createRecord(database, actor, { projectId, toolId: "D2.14" }),
      createRecord(database, actor, { projectId, toolId: "D2.14" }),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(ToolNotAvailableError),
    })
    expect(await countRecords("D2.14")).toBe(1)
  })

  it("lets exactly one through for a repeating tool and cycle", async () => {
    await openWorkbook(3)
    await recordIn("locked", "D3.1", { payload: { milestones: 2 } })

    const results = await Promise.allSettled([
      createRecord(database, actor, { projectId, toolId: "D3.4" }),
      createRecord(database, actor, { projectId, toolId: "D3.4" }),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await countRecords("D3.4")).toBe(1)
  })
})

describe("after a record is void", () => {
  it("lets the tool start again in the same cycle after a rollback", async () => {
    const opener = await recordIn("locked", "D1.16")
    const old = await recordIn("draft", "D2.14")
    const pm = await addActor(projectId, ["PM"])

    await rollBackWorkbook(database, pm, {
      projectId,
      toWorkbook: 1,
      reason: "Scope changed",
    })

    for (const step of ["submitted", "approved", "locked"] as const) {
      await transitionRecord(database, actor, opener.id, step)
    }

    const fresh = await createRecord(database, actor, {
      projectId,
      toolId: "D2.14",
    })

    expect(fresh.id).not.toBe(old.id)
    expect(fresh.cycle).toBe(1)
  })

  it("lets a repeating tool start again in the same cycle", async () => {
    await openWorkbook(3)
    await recordIn("locked", "D3.1", { payload: { milestones: 2 } })
    const old = await recordIn("draft", "D3.4")

    await database.pool.query(
      "UPDATE tool_records SET state = 'void' WHERE id = $1",
      [old.id]
    )

    expect(await open("D3.4")).toEqual(["D3.4@1"])
    expect((await recordIn("draft", "D3.4")).cycle).toBe(1)
  })
})

describe("checking the map", () => {
  const all = () => tools.listTools()

  function withRules(
    workbook: string,
    change: (rules: readonly ToolRule[]) => ToolRule[]
  ) {
    return testMaps.map((map) =>
      map.workbook === workbook ? { ...map, tools: change(map.tools) } : map
    )
  }

  // A tool with a select, outside every mapped workbook.
  const decision = defineTool({
    id: "X.DECIDE",
    name: "Decision",
    workbook: "wb06",
    fields: [
      {
        key: "decision",
        label: "Decision",
        type: "select",
        options: ["Go", "Stop"],
      },
    ],
  })

  it("accepts the test map", () => {
    expect(brokenWorkflowRules(testMaps, all())).toEqual([])
  })

  it("accepts the real opening rules of WB02 to WB05", () => {
    const later = workflowMaps.filter((map) => map.workbook !== "wb01")

    expect(brokenWorkflowRules(later, all())).toEqual([])
  })

  it("fails to load a rule that reads a field the tool does not have, naming both", () => {
    const maps = withRules("wb01", (rules) =>
      rules.map((rule) =>
        rule.tool === "D1.5"
          ? { ...rule, when: { tool: "D1.3", field: "decison", oneOf: ["Go"] } }
          : rule
      )
    )

    expect(() => loadWorkflow(maps)).toThrow(WorkflowMapError)
    expect(() => loadWorkflow(maps)).toThrow(
      /D1\.5 reads D1\.3\.decison, which D1\.3 does not have/
    )
  })

  it("keeps the map in force when a new one fails to load", async () => {
    expect(() =>
      loadWorkflow(withRules("wb01", (rules) => [...rules, { tool: "D1.99" }]))
    ).toThrow(WorkflowMapError)

    expect(await open()).toEqual(["D1.16@1", "D1.3@1", "D1.4@1"])
  })

  it("finds a rule for a tool that does not exist", () => {
    expect(
      brokenWorkflowRules(
        withRules("wb01", (rules) => [...rules, { tool: "D1.99" }]),
        all()
      )
    ).toEqual(["wb01 has a rule for D1.99, which does not exist"])
  })

  it("finds a wait for a tool that does not exist", () => {
    const maps = testMaps.map((map) =>
      map.workbook === "wb02"
        ? { ...map, opens: { after: { all: ["D1.61"] } } }
        : map
    )

    expect(brokenWorkflowRules(maps, all())).toEqual([
      "wb02 waits for D1.61, which does not exist",
    ])
  })

  it("finds an option the field does not have", () => {
    const maps = withRules("wb01", (rules) =>
      rules.map((rule) =>
        rule.tool === "D1.5"
          ? {
              ...rule,
              when: { tool: "X.DECIDE", field: "decision", oneOf: ["Maybe"] },
            }
          : rule
      )
    )

    expect(brokenWorkflowRules(maps, [...all(), decision])).toEqual([
      'D1.5 expects X.DECIDE.decision to be "Maybe", which is not one of its options',
    ])
  })

  it("finds a field that cannot decide the route", () => {
    const maps = testMaps.map((map) =>
      map.workbook === "wb03"
        ? {
            ...map,
            stops: [
              {
                tool: "D3.1",
                field: "note",
                oneOf: ["x"],
                status: "closed" as const,
              },
            ],
          }
        : map
    )

    expect(brokenWorkflowRules(maps, all())).toEqual([
      "The hard stop on D3.1 reads D3.1.note, a text field, but only a select or yes/no field can decide the route",
    ])
  })

  it("finds a registered tool with no rule in a workbook that has rules", () => {
    const maps = withRules("wb01", (rules) =>
      rules.filter((rule) => rule.tool !== "D1.3")
    )

    expect(brokenWorkflowRules(maps, all())).toEqual([
      "D1.3 is in wb01, but has no rule there",
    ])
  })

  it("finds a repeating tool in a workbook with no cycles", () => {
    const maps = withRules("wb02", (rules) => [
      ...rules.filter((rule) => rule.tool !== "D2.14"),
      { tool: "D2.14", repeats: true },
    ])

    expect(brokenWorkflowRules(maps, all())).toEqual([
      "D2.14 repeats, but wb02 does not say how many cycles there are",
    ])
  })

  it("finds a wait that a track skips", () => {
    const tierOne = defineTool({
      id: "T1.ONLY",
      name: "Tier 1 only",
      workbook: "wb06",
      tier: 1,
      fields: [{ key: "note", label: "Note", type: "text" }],
    })

    const maps = testMaps.map((map) =>
      map.workbook === "wb04"
        ? { ...map, opens: { after: { all: ["T1.ONLY"] } } }
        : map
    )

    expect(brokenWorkflowRules(maps, [...all(), tierOne])).toEqual([
      "wb04 waits for T1.ONLY, which Tier_3 projects do not use",
    ])
  })

  it("skips a map whose workbook has no tools yet", () => {
    expect(
      brokenWorkflowRules(
        [{ workbook: "wb09", opens: { after: { all: ["NOPE"] } }, tools: [] }],
        all()
      )
    ).toEqual([])
  })
})
