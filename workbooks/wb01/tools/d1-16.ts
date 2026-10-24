import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.16 fields are written in the WB01 slice.
export const d116 = defineTool({
  id: "D1.16",
  name: "Handoff Meeting Minutes",
  workbook: "wb01",
  fields: [{ key: "meetingDate", label: "Meeting Date", type: "date" }],
})
