import { defineTool } from "@/server/tools/define-tool"

// The Go / No-Go decision only, which the workflow map reads. The real D1.11
// fields are written in the WB01 slice.
export const d111 = defineTool({
  id: "D1.11",
  name: "Risk Assessment Sheet",
  workbook: "wb01",
  fields: [
    {
      key: "goNoGoDecision",
      label: "Project Go / No-Go Decision",
      type: "select",
      options: ["Go", "No-Go", "Conditional Go"],
      required: true,
    },
  ],
})
