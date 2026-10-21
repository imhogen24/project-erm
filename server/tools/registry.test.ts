import { beforeEach, describe, expect, it } from "vitest"

import { defineTool } from "./define-tool"
import {
  brokenInheritedLinks,
  createToolRegistry,
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
