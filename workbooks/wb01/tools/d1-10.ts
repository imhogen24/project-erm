import { defineTool } from "@/server/tools/define-tool"

// The capability status only, which the workflow map reads. The real D1.10
// fields are written in the WB01 slice.
export const d110 = defineTool({
  id: "D1.10",
  name: "Capability Assessment Sheet",
  workbook: "wb01",
  fields: [
    {
      key: "overallCapabilityStatus",
      label: "Overall Capability Status",
      type: "select",
      options: ["Capable", "Partially Capable", "Not Capable"],
      required: true,
    },
  ],
})
