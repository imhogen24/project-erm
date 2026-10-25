import { defineTool } from "@/server/tools/define-tool"

// One field only. The real T3.D1.15a fields are written in the WB01 slice.
export const t3d115a = defineTool({
  id: "T3.D1.15a",
  name: "T3 Drafting SOW & Quote",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.15",
  fields: [
    {
      key: "totalT3ProjectValue",
      label: "Total T3 Project Value (GHS)",
      type: "currency",
    },
  ],
})
