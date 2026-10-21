import { describe, expect, it } from "vitest"

import {
  brokenInheritedLinks,
  createToolRegistry,
} from "@/server/tools/registry"

import { allTools, registerAllTools } from "./index"

describe("registered tools", () => {
  it("includes the example D1.1, found by its id", () => {
    const registry = createToolRegistry()

    registerAllTools(registry)

    expect(registry.getTool("D1.1")?.name).toBe("Client Email / Web Form")
  })

  it("gives the example D1.1 its three fields", () => {
    const registry = createToolRegistry()

    registerAllTools(registry)

    expect(registry.getTool("D1.1")?.fields.map((field) => field.key)).toEqual([
      "clientName",
      "clientEmail",
      "requestDescription",
    ])
  })

  it("registers every tool once, with no duplicate ids", () => {
    const registry = createToolRegistry()

    registerAllTools(registry)

    expect(registry.listTools()).toHaveLength(allTools.length)
  })

  it("has no inherited link that points nowhere", () => {
    const registry = createToolRegistry()

    registerAllTools(registry)

    expect(brokenInheritedLinks(registry.listTools())).toEqual([])
  })
})
