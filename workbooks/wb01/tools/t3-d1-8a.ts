import { defineTool } from "@/server/tools/define-tool"

// One field only. The real T3.D1.8a fields are written in the WB01 slice.
export const t3d18a = defineTool({
  id: "T3.D1.8a",
  name: "T3 Physical Metrology Log",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.8",
  fields: [{ key: "date", label: "Date", type: "date" }],
})
