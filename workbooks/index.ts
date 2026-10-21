import type { ToolRegistry } from "@/server/tools/registry"

import { d11 } from "./wb01/tools/d1-1"

// The one file that lists every tool definition from every workbook.
export const allTools = [d11]

export function registerAllTools(registry: ToolRegistry) {
  for (const tool of allTools) {
    registry.registerTool(tool)
  }
}
