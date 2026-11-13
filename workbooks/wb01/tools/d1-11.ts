import {
  conclusionAnswers,
  conclusionQuestions,
  goNoGoDecisions,
  riskLevels,
} from "@/lib/risk"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Assessment metadata"

const register = "2.0 Risk register"

const questions = "3.0 Risk conclusion & go/no-go decision"

const conclusion = "4.0 Risk conclusion"

// The risks of taking the project on, assessed by the Lead Engineer on both
// tiers. The assessor, client, request ID, the capability status from D1.10
// and the date of the signature are the system's (server/risk). The LE
// writes the objective and every risk, answers the four questions, concludes,
// signs and submits; the PM approves, which locks it, or sends it back. No-Go
// closes the project; Go and Conditional Go open D1.12.
export const d111 = defineTool({
  id: "D1.11",
  name: "Risk Assessment Sheet",
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
      type: "longText",
      required: true,
      section: metadata,
    },
    {
      key: "risks",
      label: "Risk register",
      type: "table",
      required: true,
      section: register,
      startsWithRow: true,
      columns: [
        {
          key: "category",
          label: "Risk Category",
          type: "text",
          required: true,
        },
        {
          key: "description",
          label: "Specific Risk Description",
          type: "longText",
          required: true,
        },
        {
          key: "probability",
          label: "Probability (H/M/L)",
          type: "select",
          options: riskLevels,
          required: true,
        },
        {
          key: "impact",
          label: "Impact (H/M/L)",
          type: "select",
          options: riskLevels,
          required: true,
        },
        {
          key: "mitigation",
          label: "Proposed Mitigation Strategy",
          type: "longText",
          required: true,
        },
        { key: "owner", label: "Risk Owner", type: "text" },
      ],
    },
    {
      key: "conclusionQuestions",
      label: "Risk conclusion & go/no-go decision",
      type: "table",
      required: true,
      section: questions,
      prefilledRows: conclusionQuestions,
      columns: [
        { key: "question", label: "Evaluation Question", type: "text" },
        {
          key: "status",
          label: "Status (Yes/No/Partial)",
          type: "select",
          options: conclusionAnswers,
          required: true,
        },
        {
          key: "remarks",
          label: "Remarks / Conditions",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "overallRiskProfile",
      label: "Overall Risk Profile",
      type: "longText",
      required: true,
      section: conclusion,
    },
    {
      key: "goNoGoDecision",
      label: "Project Go / No-Go Decision",
      type: "select",
      options: goNoGoDecisions,
      required: true,
      section: conclusion,
    },
    {
      key: "decisionRemarks",
      label: "Decision remarks",
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
