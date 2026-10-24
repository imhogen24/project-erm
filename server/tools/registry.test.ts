import { beforeEach, describe, expect, it } from "vitest"

import { defineTool } from "./define-tool"
import {
  brokenInheritedLinks,
  UnknownWorkbookError,
  brokenReplacements,
  createToolRegistry,
  workbookNumber,
  type ToolRegistry,
} from "./registry"

function tool(id: string, workbook = "wb01") {
  return defineTool({
    id,
    name: `Tool ${id}`,
    workbook,
    fields: [{ key: "client", label: "Client", type: "text" }],
  })
}

let registry: ToolRegistry

beforeEach(() => {
  registry = createToolRegistry()
})

describe("registry", () => {
  it("finds a registered tool by its id", () => {
    const d11 = tool("D1.1")

    registry.registerTool(d11)

    expect(registry.getTool("D1.1")).toBe(d11)
  })

  it("returns nothing for an unknown id", () => {
    expect(registry.getTool("D9.9")).toBeUndefined()
  })

  it("refuses to register the same id twice", () => {
    registry.registerTool(tool("D1.1"))

    expect(() => registry.registerTool(tool("D1.1"))).toThrow()
  })

  it("lists every tool, and can filter by workbook", () => {
    registry.registerTool(tool("D1.1", "wb01"))
    registry.registerTool(tool("D2.1", "wb02"))

    expect(registry.listTools().map((entry) => entry.id)).toEqual([
      "D1.1",
      "D2.1",
    ])
    expect(
      registry.listTools({ workbook: "wb02" }).map((entry) => entry.id)
    ).toEqual(["D2.1"])
  })

  it("lists nothing for a workbook filter that matches no tool", () => {
    registry.registerTool(tool("D1.1"))

    expect(registry.listTools({ workbook: "" })).toEqual([])
  })

  it("lists nothing when nothing is registered", () => {
    expect(registry.listTools()).toEqual([])
  })

  it.each(["wb01", "wb05", "wb13"])("accepts the workbook %s", (workbook) => {
    registry.registerTool(tool("D1.1", workbook))

    expect(registry.getTool("D1.1")?.workbook).toBe(workbook)
  })

  it.each(["wb14", "wb00", "wb1", "WB01", "D1", "test", "wb01 "])(
    "refuses the workbook %j",
    (workbook) => {
      expect(() => registry.registerTool(tool("D1.1", workbook))).toThrow(
        UnknownWorkbookError
      )
      expect(registry.getTool("D1.1")).toBeUndefined()
    }
  )

  it("keeps separate registries separate", () => {
    registry.registerTool(tool("D1.1"))

    expect(createToolRegistry().getTool("D1.1")).toBeUndefined()
  })
})

describe("brokenInheritedLinks", () => {
  const source = defineTool({
    id: "D1.14",
    name: "Cost Estimation Sheet",
    workbook: "wb01",
    fields: [{ key: "totalValue", label: "Total value", type: "number" }],
  })

  function inheriting(toolId: string, field: string) {
    return defineTool({
      id: "D1.15",
      name: "Project Brief & Budget",
      workbook: "wb01",
      fields: [
        {
          key: "budget",
          label: "Budget",
          type: "number",
          inherited: { tool: toolId, field },
        },
      ],
    })
  }

  it("reports nothing when every link points at a real field", () => {
    const tools = [source, inheriting("D1.14", "totalValue")]

    expect(brokenInheritedLinks(tools)).toEqual([])
  })

  it("reports a link to a tool that does not exist", () => {
    const tools = [source, inheriting("D9.9", "totalValue")]

    expect(brokenInheritedLinks(tools)).toHaveLength(1)
  })

  it("reports a link to a field that does not exist", () => {
    const tools = [source, inheriting("D1.14", "nope")]

    expect(brokenInheritedLinks(tools)).toHaveLength(1)
  })
})

describe("brokenInheritedLinks, for table columns", () => {
  const source = defineTool({
    id: "D1.13",
    name: "Deliverables",
    workbook: "wb01",
    fields: [
      {
        key: "deliverables",
        label: "Deliverables",
        type: "table",
        columns: [{ key: "category", label: "Category", type: "text" }],
      },
    ],
  })

  function inheritingColumn(link: {
    tool: string
    field: string
    column?: string
  }) {
    return defineTool({
      id: "D1.15",
      name: "Project Brief & Budget",
      workbook: "wb01",
      fields: [
        {
          key: "allocation",
          label: "Allocation",
          type: "table",
          columns: [
            {
              key: "category",
              label: "Category",
              type: "text",
              inherited: link,
            },
            { key: "cost", label: "Cost", type: "currency" },
          ],
        },
      ],
    })
  }

  it("reports nothing when a column points at a real column", () => {
    const tools = [
      source,
      inheritingColumn({
        tool: "D1.13",
        field: "deliverables",
        column: "category",
      }),
    ]

    expect(brokenInheritedLinks(tools)).toEqual([])
  })

  it.each([
    { tool: "D9.9", field: "deliverables", column: "category" },
    { tool: "D1.13", field: "nope", column: "category" },
    { tool: "D1.13", field: "deliverables", column: "nope" },
  ])("reports a column link to $tool.$field.$column", (link) => {
    expect(brokenInheritedLinks([source, inheritingColumn(link)])).toHaveLength(
      1
    )
  })

  it("reports a link to a column of a field that is not a table", () => {
    const plain = defineTool({
      id: "D1.13",
      name: "Deliverables",
      workbook: "wb01",
      fields: [{ key: "deliverables", label: "Deliverables", type: "text" }],
    })

    expect(
      brokenInheritedLinks([
        plain,
        inheritingColumn({
          tool: "D1.13",
          field: "deliverables",
          column: "category",
        }),
      ])
    ).toHaveLength(1)
  })
})

describe("brokenReplacements", () => {
  const d13 = defineTool({ ...tool("D1.3"), tier: 1 })

  function variant(replaces: string) {
    return defineTool({ ...tool("T3.D1.3a"), tier: 3, replaces })
  }

  it("reports nothing when a variant replaces a real tool of the other tier", () => {
    expect(brokenReplacements([d13, variant("D1.3")])).toEqual([])
  })

  it("reports a variant that replaces a tool that does not exist", () => {
    expect(brokenReplacements([d13, variant("D9.9")])).toHaveLength(1)
  })

  it("reports a variant that replaces a tool of its own tier", () => {
    const d13t3 = defineTool({ ...tool("D1.3"), tier: 3 })

    expect(brokenReplacements([d13t3, variant("D1.3")])).toHaveLength(1)
  })
})

describe("workbookNumber", () => {
  it.each([
    ["wb01", 1],
    ["wb04", 4],
    ["wb10", 10],
    ["wb13", 13],
  ])("reads %s as workbook %i", (workbook, number) => {
    expect(workbookNumber(tool("T3.X", workbook))).toBe(number)
  })
})
