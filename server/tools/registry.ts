import type { Field, ToolDefinition } from "./define-tool"

export type ToolRegistry = {
  registerTool: (tool: ToolDefinition) => void
  getTool: (id: string) => ToolDefinition | undefined
  listTools: (filter?: { workbook?: string }) => ToolDefinition[]
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()

  return {
    registerTool(tool) {
      if (tools.has(tool.id)) {
        throw new Error(`A tool with id ${tool.id} is already registered`)
      }

      tools.set(tool.id, tool)
    },
    getTool: (id) => tools.get(id),
    listTools: (filter) =>
      [...tools.values()].filter(
        (tool) =>
          filter?.workbook === undefined || tool.workbook === filter.workbook
      ),
  }
}

// The registry records are checked against. server/ cannot import workbooks,
// so each workbook's tools are registered into it from outside, with
// `registerAllTools(tools)` in workbooks/index.ts.
export const tools = createToolRegistry()

export const { registerTool, getTool, listTools } = tools

// Describes every `inherited` link, on a field or a table column, whose tool,
// field or column does not exist.
export function brokenInheritedLinks(tools: ToolDefinition[]): string[] {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const broken: string[] = []

  function check(where: string, link: Field["inherited"]) {
    if (!link) {
      return
    }

    const source = byId.get(link.tool)
    const field = source?.fields.find((entry) => entry.key === link.field)

    if (!source) {
      broken.push(`${where} inherits from ${link.tool}, which does not exist`)
    } else if (!field) {
      broken.push(
        `${where} inherits ${link.field}, which ${source.id} does not have`
      )
    } else if (
      link.column !== undefined &&
      !(
        field.type === "table" &&
        field.columns.some((entry) => entry.key === link.column)
      )
    ) {
      broken.push(
        `${where} inherits ${link.field}.${link.column}, which ${source.id} does not have`
      )
    }
  }

  for (const tool of tools) {
    for (const field of tool.fields) {
      check(`${tool.id}.${field.key}`, field.inherited)

      if (field.type === "table") {
        for (const column of field.columns) {
          check(`${tool.id}.${field.key}.${column.key}`, column.inherited)
        }
      }
    }
  }

  return broken
}

// Describes every tier variant whose replaced tool does not exist, or serves
// the same tier as the variant.
export function brokenReplacements(tools: ToolDefinition[]): string[] {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const broken: string[] = []

  for (const tool of tools) {
    if (!tool.replaces) {
      continue
    }

    const replaced = byId.get(tool.replaces)

    if (!replaced) {
      broken.push(`${tool.id} replaces ${tool.replaces}, which does not exist`)
    } else if (replaced.tier === tool.tier) {
      broken.push(
        `${tool.id} replaces ${replaced.id}, but both are Tier ${tool.tier} tools`
      )
    }
  }

  return broken
}
