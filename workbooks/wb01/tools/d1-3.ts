import { defineTool } from "@/server/tools/define-tool"

const coreObjectives = [
  "Primary Purpose / Business Goal",
  "Main Deliverables Requested",
  "Specific Constraints Noted",
]

// The Tier 1 record of the request the OM received. The client and project
// details are not fields: the title block and the client request panel show
// them on every tool. The SN column of the sheet is the row number, so it is
// shown and never stored.
export const d13 = defineTool({
  id: "D1.3",
  name: "Received Request Record",
  workbook: "wb01",
  tier: 1,
  fields: [
    {
      key: "coreObjectives",
      label: "Core Objectives and Scope",
      type: "table",
      lockedRows: coreObjectives,
      optionalRows: ["Specific Constraints Noted"],
      columns: [
        { key: "item", label: "Item", type: "text" },
        {
          key: "description",
          label: "Description",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "operands",
      label: "Input / Output Operands",
      type: "table",
      prefilledRows: ["M", "E", "I", "L"],
      // From docs/dev_docs/WORKBOOK_01/README.md: the four operands.
      rowNotes: {
        M: "Material",
        E: "Energy",
        I: "Information",
        L: "Living thing",
      },
      columns: [
        { key: "operand", label: "Operand", type: "text" },
        { key: "input", label: "Input", type: "longText" },
        { key: "output", label: "Output", type: "longText" },
      ],
    },
    {
      key: "operators",
      label: "Operators (The System Environment)",
      type: "table",
      prefilledRows: [
        "Human System",
        "Technical System",
        "Active Environment",
        "Information System",
        "Management System",
      ],
      columns: [
        { key: "operator", label: "Operator", type: "text" },
        { key: "description", label: "Description", type: "longText" },
      ],
    },
    {
      key: "missingInformation",
      label: "Identified Missing Information",
      type: "table",
      columns: [
        { key: "item", label: "Item", type: "longText" },
        { key: "assignee", label: "Assignee", type: "text" },
        { key: "status", label: "Status", type: "longText" },
      ],
    },
  ],
})
