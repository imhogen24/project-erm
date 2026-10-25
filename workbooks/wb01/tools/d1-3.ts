import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.3 fields are written in the WB01 slice.
export const d13 = defineTool({
  id: "D1.3",
  name: "Received Request Record",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "clientName", label: "Client Name", type: "text" }],
})
