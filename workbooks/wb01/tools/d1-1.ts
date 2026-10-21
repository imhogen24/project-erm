import { defineTool } from "@/server/tools/define-tool"

// Three fields only. The real D1.1 fields are written in the WB01 slice.
export const d11 = defineTool({
  id: "D1.1",
  name: "Client Email / Web Form",
  workbook: "wb01",
  fields: [
    { key: "clientName", label: "Client name", type: "text", required: true },
    { key: "clientEmail", label: "Client email", type: "text", required: true },
    {
      key: "requestDescription",
      label: "Request description",
      type: "longText",
    },
  ],
})
