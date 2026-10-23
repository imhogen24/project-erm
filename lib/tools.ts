import { createToolRegistry } from "@/server/tools/registry"
import { registerAllTools } from "@/workbooks"

// Its own registry, filled once when this file first loads, so a page can ask
// for the tools without registering them twice.
const registry = createToolRegistry()

registerAllTools(registry)

export const registeredTools = registry.listTools()
