import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.6 fields are written in the WB01 slice.
export const d16 = defineTool({
  id: "D1.6",
  name: "Calendar Invite & Agenda",
  workbook: "wb01",
  tier: 1,
  fields: [{ key: "meetingIdPin", label: "Meeting ID / PIN", type: "text" }],
})
