import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.5 fields are written in the WB01 slice.
export const d15 = defineTool({
  id: "D1.5",
  name: "Meeting Time Proposal",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "agreedDate", label: "Agreed Date", type: "date" }],
})
