import { getTool, listTools, registerTool } from "@/server/tools/registry"
import { allTools } from "@/workbooks"

// Puts every workbook tool into the registry that record writes are checked
// against. server/ cannot import workbooks/, so the app side does it. It is safe
// to call again: a tool already there is left alone, so a reload or a second
// screen never registers one twice. Any screen that saves records calls it first.
export function ensureToolsRegistered() {
  for (const tool of allTools) {
    if (!getTool(tool.id)) {
      registerTool(tool)
    }
  }
}

ensureToolsRegistered()

export const registeredTools = listTools()
