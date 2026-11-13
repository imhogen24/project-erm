import {
  capabilityObjective,
  capabilityStatuses,
  commercialCriteria,
  criterionStatuses,
  technicalCriteria,
} from "@/lib/capability"
import { defineTool, type Column } from "@/server/tools/define-tool"

const metadata = "1.0 Review initiation metadata"

const technical = "2.0 Technical capability (engineering & manufacturing)"

const additional = "3.0 Additional technical capacity assessment"

const commercial = "4.0 Commercial alignment"

const conclusion = "5.0 Capability conclusion"

// Each criterion's answer and why.
const assessed: Column[] = [
  {
    key: "status",
    label: "Status (Yes/No/Partial)",
    type: "select",
    options: criterionStatuses,
    required: true,
  },
  {
    key: "justification",
    label: "Justification / Identified Gaps",
    type: "longText",
    required: true,
  },
]

// Whether IMHOGEN can do the work, assessed by the Lead Engineer on both
// tiers. The assessor, client, project, request ID and the date of the
// signature are the system's (server/capability). The LE answers every
// criterion, adds the project's own technical ones in 3.0, concludes, signs
// and submits; the PM approves, which locks it, or sends it back. Not Capable
// rejects the project; the others open D1.11.
export const d110 = defineTool({
  id: "D1.10",
  name: "Capability Assessment Sheet",
  workbook: "wb01",
  fields: [
    {
      key: "assessor",
      label: "Assessor (Head of Ops/Lead Eng)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "clientName",
      label: "Project/Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "assessmentDate",
      label: "Date of Assessment",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when signed",
      section: metadata,
    },
    {
      key: "projectTitle",
      label: "Project",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "requestId",
      label: "Reference Request ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "primaryObjective",
      label: "Primary Review Objective",
      type: "instruction",
      content: capabilityObjective,
      section: metadata,
    },
    {
      key: "technicalCapability",
      label: "Technical capability (engineering & manufacturing)",
      type: "table",
      required: true,
      section: technical,
      prefilledRows: technicalCriteria,
      columns: [
        { key: "criterion", label: "Evaluation Criteria", type: "text" },
        ...assessed,
      ],
    },
    {
      key: "additionalCapacity",
      label: "Additional technical capacity assessment",
      type: "table",
      section: additional,
      startsWithRow: true,
      columns: [
        {
          key: "criterion",
          label: "Evaluation Criteria",
          type: "text",
          required: true,
        },
        ...assessed,
      ],
    },
    {
      key: "commercialAlignment",
      label: "Commercial alignment",
      type: "table",
      required: true,
      section: commercial,
      prefilledRows: commercialCriteria,
      columns: [
        { key: "criterion", label: "Evaluation Criteria", type: "text" },
        ...assessed,
      ],
    },
    {
      key: "overallCapabilityStatus",
      label: "Overall Capability Status",
      type: "select",
      options: capabilityStatuses,
      required: true,
      section: conclusion,
    },
    {
      key: "primaryBottleneck",
      label: "Primary Bottleneck (If any)",
      type: "longText",
      section: conclusion,
    },
    {
      key: "assessorSignature",
      label: "Assessor Signature",
      type: "signature",
      signedBy: ["LE"],
      section: conclusion,
    },
  ],
})
