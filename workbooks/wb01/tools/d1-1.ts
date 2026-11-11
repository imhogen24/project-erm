import { defineTool } from "@/server/tools/define-tool"

// The client's own web form, Tier 1 or Tier 3. The answers are kept in the
// saved request (intake_submissions), which the D1.1 screen draws; the record
// holds the files the client attached. Only the client writes it, from the
// website or the ERM, and it locks the moment it is submitted. Everyone else
// reads it. A change goes through a change request; the client makes it.
export const d11 = defineTool({
  id: "D1.1",
  name: "Client Email / Web Form",
  workbook: "wb01",
  fields: [
    {
      key: "attachedFiles",
      label: "Attached files",
      type: "table",
      readOnly: true,
      columns: [
        { key: "label", label: "Label", type: "text" },
        { key: "dateUploaded", label: "Date uploaded", type: "date" },
        { key: "fileLink", label: "File link", type: "fileLink" },
      ],
    },
  ],
})
