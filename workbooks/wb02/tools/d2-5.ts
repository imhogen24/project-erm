import {
  HOLD_FOR_REVISION,
  executiveDecisions,
  executiveNextSteps,
  macroRisks,
  signOffCheckpoints,
  verifiedOrMissing,
} from "@/lib/executive-review"
import { FINANCE_REVIEW } from "@/lib/finance-review"
import { REVIEWED_DRAFT, yesNo } from "@/lib/pm-review"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Review metadata"

const alignment = "4.0 Strategic alignment"

const authorization = "5.0 Executive authorization & routing"

// Each table keeps the rows it starts with: the executive changes their text
// and answers them, and can add rows after them and remove those.
function startingRows(count: number) {
  return Array.from({ length: count }, () => ({}))
}

// The Head of R&D / Ops's review of the draft contract, on both tiers, opened
// once the FO locks D2.4 with Approved: the last internal check before the
// contract reaches the client. 1.0 is the system's and shows the draft and
// the Finance review. 2.0 and 3.0 start from the sheet's rows
// (server/contract/executive-review). The executive signs and submits, which
// locks it: Approved for Client Transmission is for D2.6, Rejected closes the
// project, and Hold for Revision sends the draft back to its writer as a new
// iteration, after which D2.3, D2.4 and then D2.5 run again.
export const d25 = defineTool({
  id: "D2.5",
  name: "Executive Review Draft",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  sendsBackTo: {
    field: "executiveDecision",
    is: HOLD_FOR_REVISION,
    tools: [REVIEWED_DRAFT],
  },
  fields: [
    {
      key: "executive",
      label: "Reviewing Executive",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "dateReceived",
      label: "Date Received for Review",
      type: "date",
      systemFilled: true,
      systemNote: "The day the Finance review was locked",
      section: metadata,
    },
    {
      key: "projectClientName",
      label: "Project / Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "referenceDraft",
      label: "Reference Draft",
      type: "pdfPreview",
      source: { tool: REVIEWED_DRAFT },
      section: metadata,
    },
    {
      key: "financeReview",
      label: "Finance Review (D2.4 Finance Approved)",
      type: "pdfPreview",
      source: { tool: FINANCE_REVIEW },
      section: metadata,
    },
    {
      key: "projectValue",
      label: "Overall Project Value",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "signOffVerification",
      label: "2.0 Departmental sign-off verification",
      type: "table",
      required: true,
      fixedRows: startingRows(signOffCheckpoints.length),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "checkpoint",
          label: "Departmental Checkpoint",
          type: "text",
          required: true,
        },
        {
          key: "status",
          label: "Status (Verified / Missing)",
          type: "select",
          options: verifiedOrMissing,
          required: true,
        },
        {
          key: "notes",
          label: "Executive Notes / Overrides",
          type: "text",
        },
      ],
    },
    {
      key: "riskAssessment",
      label: "3.0 Macro risk assessment (executive level)",
      type: "table",
      required: true,
      fixedRows: startingRows(macroRisks.length),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "category",
          label: "Risk Category",
          type: "text",
          required: true,
        },
        {
          key: "question",
          label: "Executive Assessment Question",
          type: "text",
          required: true,
        },
        {
          key: "status",
          label: "Status (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        {
          key: "remarks",
          label: "Remarks / Accepted Liabilities",
          type: "text",
        },
      ],
    },
    {
      key: "strategicAlignment",
      label:
        "Does this project align with IMHO GEN's long-term strategic objectives for 2026?",
      type: "select",
      options: yesNo,
      required: true,
      section: alignment,
    },
    {
      key: "justification",
      label: "Executive Justification for Acceptance",
      type: "longText",
      placeholder:
        "e.g. While margins are tight this project establishes a critical foothold in the agricultural processing sector.",
      section: alignment,
    },
    {
      key: "executiveDecision",
      label: "Executive Decision",
      type: "select",
      options: executiveDecisions,
      required: true,
      section: authorization,
    },
    {
      key: "nextStepDirective",
      label: "Next Step Directive",
      type: "text",
      systemFilled: true,
      shownFrom: { field: "executiveDecision", values: executiveNextSteps },
      systemNote: "Shown once a decision is chosen",
      section: authorization,
    },
    {
      key: "signOffDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: "Filled in when D2.5 is submitted",
      section: authorization,
    },
    // After the date, as in D2.3 and D2.4, so 5.0 stays one box above the
    // signature.
    {
      key: "heSignature",
      label: "Head of R&D / Ops Signature",
      type: "signature",
      signedBy: ["HE"],
      section: authorization,
    },
  ],
})
