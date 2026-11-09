import { defineTool } from "@/server/tools/define-tool"

// The six drafting services and the file formats each one is delivered in, from
// the product owner's table of 6 Nov 2026. The locked rows of `draftingSpecs`
// take their File Format from here.
export const draftingServiceFormats = {
  "3D Modelling": "STEP, Native CAD, IGES",
  "General Arrangement/Assembly": "PDF, DXF, DWG",
  "Manuals/Technical Illustrations": "PDF, PNG/JPG",
  "Automated BOM Extraction": "PDF",
  "2D Manufacturing Drawings (GD&T)": "PDF, DXF, DWG",
  Renderings: "PDF, PNG/JPG",
} as const

export const qualityGateQuestions = [
  "Does the provided source data allow for the requested tolerances?",
  "Is a site visit required for manual measurements?",
]

// The Tier 3 intake that takes the place of D1.3. The client and project
// details are not fields: the title block and the client request panel show
// them on every tool.
export const t3d13a = defineTool({
  id: "T3.D1.3a",
  name: "T3 Technical Intake (Drafting)",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.3",
  fields: [
    {
      key: "sourceAssets",
      label: "Source Asset Evaluation",
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "assetType", label: "Asset Type", type: "text", required: true },
        {
          key: "formatDescription",
          label: "Format / Description",
          type: "longText",
        },
        { key: "condition", label: "Condition", type: "longText" },
        { key: "actionRequired", label: "Action Required", type: "longText" },
        { key: "notes", label: "Notes", type: "longText" },
      ],
    },
    {
      key: "draftingSpecs",
      label: "Drafting Specifications",
      type: "table",
      required: true,
      columns: [
        { key: "requirement", label: "Requirement", type: "text" },
        { key: "standard", label: "Standard", type: "text" },
        {
          key: "toleranceClass",
          label: "Tolerance Class",
          type: "select",
          options: ["Medium (m)", "General", "High"],
          required: true,
        },
        { key: "fileFormat", label: "File Format", type: "text" },
        { key: "notes", label: "Notes", type: "longText" },
      ],
    },
    {
      key: "qualityGate",
      label: "Quality Gate: Data Sufficiency",
      type: "table",
      prefilledRows: qualityGateQuestions,
      columns: [
        { key: "question", label: "Question", type: "text" },
        {
          key: "answer",
          label: "Answer",
          type: "select",
          options: ["Yes", "No"],
          required: true,
        },
        { key: "reason", label: "Reason", type: "longText" },
      ],
    },
  ],
})
