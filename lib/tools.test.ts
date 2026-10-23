import { describe, expect, it } from "vitest"

import { getTool, listTools } from "@/server/tools/registry"
import { allTools } from "@/workbooks"

import { ensureToolsRegistered } from "./tools"

describe("registering the workbook tools for record writes", () => {
  it("puts every workbook tool into the registry that writes are checked against", () => {
    ensureToolsRegistered()

    for (const tool of allTools) {
      expect(getTool(tool.id)?.name).toBe(tool.name)
    }
  })

  it("can run again without registering a tool twice", () => {
    ensureToolsRegistered()

    expect(() => ensureToolsRegistered()).not.toThrow()
    expect(listTools()).toHaveLength(allTools.length)
  })
})
