import { defineTool } from "@/server/tools/define-tool"

// The overhead answer only, which the workflow map reads. The real D1.14
// fields are written in the WB01 slice.
export const d114 = defineTool({
  id: "D1.14",
  name: "Cost Estimation Sheet",
  workbook: "wb01",
  fields: [
    {
      key: "minimumOverheadMet",
      label: "Is the minimum overhead recovery met?",
      type: "boolean",
      required: true,
    },
  ],
})
