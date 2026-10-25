import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.13 fields are written in the WB01 slice.
export const d113 = defineTool({
  id: "D1.13",
  name: "Draft Scope of Work",
  workbook: "wb01",
  fields: [
    {
      key: "draftedBy",
      label: "Drafted By (Lead Engineer / PM)",
      type: "text",
    },
  ],
})
