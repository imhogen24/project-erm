import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.12 fields are written in the WB01 slice.
export const d112 = defineTool({
  id: "D1.12",
  name: "Feasibility Report",
  workbook: "wb01",
  fields: [
    {
      key: "assessor",
      label: "Assessor (Head of Ops / Lead Engineer)",
      type: "text",
    },
  ],
})
