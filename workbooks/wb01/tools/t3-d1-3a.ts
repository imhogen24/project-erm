import { defineTool } from "@/server/tools/define-tool"

// One field only. The real T3.D1.3a fields are written in the WB01 slice.
export const t3d13a = defineTool({
  id: "T3.D1.3a",
  name: "T3 Technical Intake (Drafting)",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.3",
  fields: [
    {
      key: "dataSufficientForTolerances",
      label:
        "Does the provided source data allow for the requested tolerances?",
      type: "boolean",
    },
  ],
})
