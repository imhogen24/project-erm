import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.15 fields are written in the WB01 slice.
export const d115 = defineTool({
  id: "D1.15",
  name: "Project Brief & Draft Budget",
  workbook: "wb01",
  tier: 1,
  fields: [
    {
      key: "referenceRequestId",
      label: "Reference Request ID",
      type: "text",
    },
  ],
})
