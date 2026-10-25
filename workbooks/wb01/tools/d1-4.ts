import { defineTool } from "@/server/tools/define-tool"

// One field only. The real D1.4 fields are written in the WB01 slice.
export const d14 = defineTool({
  id: "D1.4",
  name: "Acknowledgement Email",
  workbook: "wb01",
  fields: [{ key: "ccBcc", label: "CC / BCC", type: "text" }],
})
