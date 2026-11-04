import { defineTool, type Workbook } from "./define-tool"
import { tools } from "./registry"

// Gives each tool a test uses a definition in its workbook if it has no real
// one yet. The one field is optional, so an empty payload is valid and can be
// submitted.
export function registerTestTools(
  byWorkbook: Partial<Record<Workbook, string[]>>
) {
  for (const [workbook, ids = []] of Object.entries(byWorkbook)) {
    for (const id of ids) {
      if (tools.getTool(id)) {
        continue
      }

      tools.registerTool(
        defineTool({
          id,
          name: `Test ${id}`,
          workbook,
          fields: [{ key: "note", label: "Note", type: "text" }],
        })
      )
    }
  }
}

const reviewStatuses = ["Pending", "Reviewed", "Approved"]

// D1.1 as workbooks/wb01 defines it, for a test in server/, which cannot import
// workbooks/. The app registers the real one.
export function registerTestD11() {
  if (tools.getTool("D1.1")) {
    return
  }

  tools.registerTool(
    defineTool({
      id: "D1.1",
      name: "Client Email / Web Form",
      workbook: "wb01",
      fields: [
        {
          key: "requestStatus",
          label: "Request status",
          type: "select",
          options: reviewStatuses,
          systemOptions: ["Approved"],
          required: true,
        },
        {
          key: "attachedFiles",
          label: "Attached files",
          type: "table",
          columns: [
            { key: "label", label: "Label", type: "text" },
            { key: "dateUploaded", label: "Date uploaded", type: "date" },
            { key: "fileLink", label: "File link", type: "fileLink" },
            {
              key: "status",
              label: "Status",
              type: "select",
              options: reviewStatuses,
              systemOptions: ["Approved"],
            },
          ],
        },
      ],
    })
  )
}
