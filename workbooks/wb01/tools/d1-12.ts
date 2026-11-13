import {
  capabilityDomains,
  domainStatuses,
  feasibilityObjective,
  impactLevels,
} from "@/lib/feasibility"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Review initiation metadata"

const technical = "2.0 Technical capability (engineering & manufacturing)"

const risks = "3.0 Critical risks & required mitigations (sourced from D1.11)"

const commercial = "4.0 Commercial feasibility (timeline & budget alignment)"

const routing = "5.0 Final recommendation & routing"

// The report that sums up D1.10 and D1.11 for the decision to go ahead, on
// both tiers. The assessor, client, capability status, request ID, the
// client's timeline and budget, and the date of the signature are the
// system's (server/feasibility); the critical risks start from D1.11's
// register. The LE assesses each capability domain, settles the risks and
// their contract mitigations, sets IMHOGEN's timeline and cost floor,
// recommends, signs and submits; the PM approves, which locks it, or sends it
// back. The client reads it once approved.
export const d112 = defineTool({
  id: "D1.12",
  name: "Feasibility Report",
  workbook: "wb01",
  clientReadsOnceLocked: true,
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
      key: "overallCapabilityStatus",
      label: "Overall Capability Status",
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
      content: feasibilityObjective,
      section: metadata,
    },
    {
      key: "capability",
      label: "Technical capability (engineering & manufacturing)",
      type: "table",
      required: true,
      section: technical,
      lockedRows: capabilityDomains,
      columns: [
        {
          key: "domain",
          label: "Capability Domain",
          type: "text",
          required: true,
        },
        {
          key: "status",
          label: "Status (Capable/Partial)",
          type: "select",
          options: domainStatuses,
          required: true,
        },
        {
          key: "findings",
          label: "Key Findings / Gaps to Bridge",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "criticalRisks",
      label: "Critical risks & required mitigations",
      type: "table",
      required: true,
      section: risks,
      startsWithRow: true,
      columns: [
        {
          key: "risk",
          label: "Primary Risk Identified",
          type: "longText",
          required: true,
        },
        {
          key: "impact",
          label: "Impact Level",
          type: "select",
          options: impactLevels,
          required: true,
        },
        {
          key: "mitigation",
          label: "Mandatory Mitigation Strategy (Must be in Contract)",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "clientTimeline",
      label: "Client's Target Timeline",
      type: "text",
      systemFilled: true,
      section: commercial,
    },
    {
      key: "clientBudget",
      label: "Client's Estimated Budget",
      type: "text",
      systemFilled: true,
      section: commercial,
    },
    {
      key: "realisticTimeline",
      label: "IMHOGEN Realistic Timeline",
      type: "text",
      required: true,
      section: commercial,
    },
    {
      key: "costFloor",
      label: "IMHOGEN Estimated Cost Floor (GHS)",
      type: "currency",
      required: true,
      section: commercial,
    },
    {
      key: "commercialNotes",
      label: "Commercial Alignment Notes",
      type: "longText",
      required: true,
      section: commercial,
    },
    {
      key: "recommendation",
      label: "Recommendation",
      type: "longText",
      required: true,
      section: routing,
    },
    {
      key: "assessorSignature",
      label: "Head of R&D Signature",
      type: "signature",
      signedBy: ["LE"],
      section: routing,
    },
  ],
})
