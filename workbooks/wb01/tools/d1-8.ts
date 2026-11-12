import {
  needsCategories,
  priorities,
  specCategories,
} from "@/lib/needs-assessment"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Synthesis metadata"

const constraints = "2.0 Confirmed constraints"

const specs = "3.0 Preliminary design specifications (draft PR-set)"

const routing = "4.0 Synthesis approval & routing"

// The Lead Engineer turns the meeting notes into confirmed constraints and a
// first set of design requirements. Each 2.0 row shows the client's own
// technical answer from the web form beside it. The LE signs and submits; the
// PM approves, which locks it and opens D1.9, or sends it back. What 1.0 and
// 4.0 say is the system's, from who submitted and when (server/needs). Tier 1
// only. The sheet is the source: docs/dev_docs/WORKBOOK_01, D1.8.
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
      systemFilled: true,
      systemNote: "The Lead Engineer who submits",
      section: metadata,
    },
    {
      key: "synthesisDate",
      label: "Date of Synthesis",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when submitted",
      section: metadata,
    },
    {
      key: "rawNotesReference",
      label: "Reference Raw Notes ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "clientProjectName",
      label: "Client/Project Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "constraints",
      label: "Confirmed constraints",
      type: "table",
      section: constraints,
      prefilledRows: [...needsCategories],
      columns: [
        { key: "category", label: "Category", type: "text" },
        {
          key: "confirmed",
          label: "Confirmed Constraints / Specifications",
          type: "longText",
        },
        {
          key: "remarks",
          label: "Engineering Remarks (Risks/Clarifications)",
          type: "longText",
        },
      ],
    },
    {
      key: "designSpecs",
      label: "Preliminary design specifications",
      type: "table",
      section: specs,
      lockedRows: specCategories,
      optionalRows: specCategories,
      columns: [
        {
          key: "category",
          label: "Requirement Category",
          type: "text",
          required: true,
        },
        {
          key: "requirement",
          label: "Specific Requirement / Tolerance",
          type: "longText",
          required: true,
        },
        {
          key: "priority",
          label: "Priority (Fixed/Wish)",
          type: "select",
          options: priorities,
          required: true,
        },
        {
          key: "tolerance",
          label: "Specific Requirement / Tolerance",
          type: "longText",
        },
      ],
    },
    {
      key: "synthesisComplete",
      label: "Synthesis Complete? (Yes/No)",
      type: "text",
      systemFilled: true,
      section: routing,
    },
    {
      key: "leadEngineerSignature",
      label: "Lead Engineer Signature",
      type: "signature",
      signedBy: ["LE"],
      section: routing,
    },
    {
      key: "readyForReview",
      label: "Ready for Internal Review (D1.9)?",
      type: "text",
      systemFilled: true,
      section: routing,
    },
  ],
})
