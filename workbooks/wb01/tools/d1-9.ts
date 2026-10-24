import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.9 fields are written in the WB01 slice.
export const d19 = defineTool({
  id: "D1.9",
  name: "Internal Review Request",
  workbook: "wb01",
  fields: [
    {
      key: "requestedBy",
      label: "Requested By (Lead Engineer / PM)",
      type: "text",
    },
  ],
})
