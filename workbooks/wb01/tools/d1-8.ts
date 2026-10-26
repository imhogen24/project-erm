import { defineTool } from "@/server/tools/define-tool"

// Two fields only. The real D1.8 fields are written in the WB01 slice. The
// signature is the one the WB01 schema lists, so signing can be tried.
export const d18 = defineTool({
  id: "D1.8",
  name: "Needs Assessment Notes",
  workbook: "wb01",
  tier: 1,
  fields: [
    {
      key: "synthesizedBy",
      label: "Synthesized By (Lead Engineer)",
      type: "text",
    },
    {
      key: "leadEngineerSignature",
      label: "Lead Engineer Signature",
      type: "signature",
      signedBy: ["LE"],
    },
  ],
})
