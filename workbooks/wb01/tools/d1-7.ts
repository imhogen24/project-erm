import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.7 fields are written in the WB01 slice.
export const d17 = defineTool({
  id: "D1.7",
  name: "Raw Meeting Notes",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "actualDate", label: "Actual Date", type: "date" }],
})
