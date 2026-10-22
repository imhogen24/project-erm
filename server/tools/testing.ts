import { defineTool } from "./define-tool"
import { tools } from "./registry"

// Gives each tool a test uses a definition if it has no real one yet. The one
// field is optional, so an empty payload is valid and can be submitted.
export function registerTestTools(ids: string[]) {
  for (const id of ids) {
    if (tools.getTool(id)) {
      continue
    }

    tools.registerTool(
      defineTool({
        id,
        name: `Test ${id}`,
        workbook: "test",
        fields: [{ key: "note", label: "Note", type: "text" }],
      })
    )
  }
}
