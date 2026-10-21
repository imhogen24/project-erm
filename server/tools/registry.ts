import type { ToolDefinition } from "./define-tool"

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

export const { registerTool, getTool, listTools } = createToolRegistry()

// Describes every `inherited` link whose tool or field does not exist.
export function brokenInheritedLinks(tools: ToolDefinition[]): string[] {
  const byId = new Map(tools.map((tool) => [tool.id, tool]))
  const broken: string[] = []

  for (const tool of tools) {
    for (const field of tool.fields) {
      if (!field.inherited) {
        continue
      }

      const source = byId.get(field.inherited.tool)

      if (!source) {
        broken.push(
          `${tool.id}.${field.key} inherits from ${field.inherited.tool}, which does not exist`
        )
      } else if (
        !source.fields.some((entry) => entry.key === field.inherited?.field)
      ) {
        broken.push(
          `${tool.id}.${field.key} inherits ${field.inherited.field}, which ${source.id} does not have`
        )
      }
    }
  }

  return broken
}
