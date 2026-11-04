import { defineTool } from "@/server/tools/define-tool"

// The review record the intake creates for each website request. The intake
// sets Pending and adds the file rows, the OM sets Reviewed, and the system
// sets Approved when the PM approves, so the form can never choose it.
const statuses = ["Pending", "Reviewed", "Approved"]

export const d11 = defineTool({
  id: "D1.1",
  name: "Client Email / Web Form",
  workbook: "wb01",
  fields: [
    {
      key: "requestStatus",
      label: "Request status",
      type: "select",
      options: statuses,
      systemOptions: ["Approved"],
      required: true,
    },
    {
      key: "attachedFiles",
      label: "Attached files",
      type: "table",
      readOnly: true,
      columns: [
        { key: "label", label: "Label", type: "text" },
        { key: "dateUploaded", label: "Date uploaded", type: "date" },
        { key: "fileLink", label: "File link", type: "fileLink" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: statuses,
          systemOptions: ["Approved"],
        },
      ],
    },
  ],
})
