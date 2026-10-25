import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.8 fields are written in the WB01 slice.
export const d18 = defineTool({
  id: "D1.8",
  name: "Needs Assessment Notes",
  workbook: "wb01",
  tier: 1,
  fields: [
    {
      key: "synthesizedBy",
      label: "Synthesized By (Lead Engineer)",
      type: "text",
    },
  ],
})
