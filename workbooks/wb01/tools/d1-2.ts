import { defineTool } from "@/server/tools/define-tool"

// The triage decision only, which the workflow map reads. The real D1.2
// fields are written in the WB01 slice.
export const d12 = defineTool({
  id: "D1.2",
  name: "Initial Inquiry Notification",
  workbook: "wb01",
  fields: [
    {
      key: "triageDecision",
      label: "Triage Decision",
      type: "select",
      options: ["Proceed to D1.3", "Reject as Spam"],
      required: true,
    },
  ],
})
