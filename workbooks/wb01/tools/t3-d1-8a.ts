import { defineTool } from "@/server/tools/define-tool"

const equipment = "1.0 Measurement equipment verification"

const dimensions = "2.0 Critical dimension capture"

const photos = "3.0 Photographic evidence checklist"

const signOff = "4.0 Field sign-off"

// The Tier 3 record of measuring the client's part, in place of D1.8: the
// tools used, each critical dimension with a photo, and the photos and videos
// taken, uploaded into the ERM or linked. The AE who measured signs and
// submits; the LE approves, which locks it and opens D1.9, or sends it back.
// The sheet is the source: docs/dev_docs/WORKBOOK_01, T3.D1.8a.
export const t3d18a = defineTool({
  id: "T3.D1.8a",
  name: "T3 Physical Metrology Log",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.8",
  fields: [
    {
      key: "equipment",
      label: "Measurement equipment",
      type: "table",
      required: true,
      section: equipment,
      startsWithRow: true,
      columns: [
        { key: "tool", label: "Tool Used", type: "text", required: true },
        { key: "serial", label: "Serial # / ID", type: "text" },
        {
          key: "calibration",
          label: "Calibration Status",
          type: "text",
        },
        { key: "accuracy", label: "Accuracy Range", type: "text" },
        { key: "notes", label: "Notes", type: "text" },
      ],
    },
    {
      key: "dimensions",
      label: "Critical dimensions",
      type: "table",
      required: true,
      section: dimensions,
      startsWithRow: true,
      columns: [
        {
          key: "feature",
          label: "Feature Name",
          type: "text",
          required: true,
        },
        {
          key: "method",
          label: "Measurement Method",
          type: "text",
          required: true,
        },
        {
          key: "value",
          label: "Measured Value (mm)",
          type: "text",
          required: true,
        },
        { key: "photo", label: "Ref. Photo", type: "fileLink" },
        {
          key: "confidence",
          label: "Confidence (H/M/L)",
          type: "select",
          options: ["High", "Medium", "Low"],
          required: true,
        },
        { key: "notes", label: "Notes", type: "text" },
      ],
    },
    {
      key: "photos",
      label: "Photographic evidence",
      type: "table",
      required: true,
      section: photos,
      startsWithRow: true,
      columns: [
        {
          key: "view",
          label: "View Required",
          type: "text",
          required: true,
        },
        {
          key: "captured",
          label: "Captured? (Y/N)",
          type: "select",
          options: ["Yes", "No"],
          required: true,
        },
        { key: "file", label: "File / Folder", type: "fileLink" },
        { key: "quality", label: "Quality Note", type: "text" },
      ],
    },
    {
      key: "confirmation",
      label: "Confirmation",
      type: "instruction",
      content:
        "I confirm that all critical dimensions have been captured and the physical machine can be released.",
      section: signOff,
    },
    {
      key: "leadMeasurerSignature",
      label: "Lead Measurer Signature",
      type: "signature",
      signedBy: ["AE"],
      section: signOff,
    },
  ],
})
