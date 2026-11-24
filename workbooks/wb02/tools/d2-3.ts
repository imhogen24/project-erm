import {
  REVIEWED_DRAFT,
  REVISIONS_REQUIRED,
  accurateOrMismatch,
  nextSteps,
  verificationStatuses,
  yesNo,
} from "@/lib/pm-review"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Review metadata"

// The sheet gives this part no title.
const signOff = "Sign-off"

const onLock = "Filled in when D2.3 is submitted"

// The PM's review of the initial draft contract, on both tiers, opened once
// D2.2 locks (T3.D2.2a on Tier 3). 1.0 is the system's and shows the draft.
// 2.0 to 4.0 start from the sheet's rows, and 4.0 from D1.15's client
// dependencies on Tier 1 (server/contract/pm-review); the PM can change them
// and add rows. The PM signs and submits, which locks it: Approved opens
// D2.4, and Revisions Required sends the draft back to its writer as a new
// iteration, after which D2.3 reopens for the PM.
export const d23 = defineTool({
  id: "D2.3",
  name: "PM Review Draft",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  sendsBackTo: {
    field: "operationalStatus",
    is: REVISIONS_REQUIRED,
    tools: [REVIEWED_DRAFT],
  },
  fields: [
    {
      key: "projectManager",
      label: "Assigned Project Manager",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "dateReceived",
      label: "Date Received for Review",
      type: "date",
      systemFilled: true,
      systemNote: "The day the draft was locked",
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
      key: "dateReviewCompleted",
      label: "Date Review Completed",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "scopeVerification",
      label: "2.0 Scope & deliverables verification",
      type: "table",
      required: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "category",
          label: "Deliverable Category",
          type: "text",
          required: true,
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          placeholders: ["e.g. Section 2.1"],
        },
        {
          key: "status",
          label: "Status (Accurate / Mismatch)",
          type: "select",
          options: accurateOrMismatch,
          required: true,
        },
        {
          key: "comments",
          label: "PM Comments / Required Edits",
          type: "text",
          placeholders: ["", "", "", "Are boundaries tight enough?"],
        },
      ],
    },
    {
      key: "projectVerification",
      label: "3.0 Project verification",
      type: "table",
      required: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "milestone",
          label: "Project Milestone",
          type: "text",
          required: true,
        },
        {
          key: "timeline",
          label: "Contracted Timeline",
          type: "text",
          placeholders: ["e.g. 14 Days"],
        },
        {
          key: "feasible",
          label: "Workshop Feasible? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        {
          key: "justification",
          label: "Justification / Required Adjustment",
          type: "text",
        },
      ],
    },
    {
      key: "clientDependencies",
      label: "4.0 Critical dependencies & client obligations",
      type: "table",
      required: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "4" },
        {
          key: "dependency",
          label: "Client Dependency required for timeline",
          type: "text",
          required: true,
          placeholders: ["e.g. Client must sign off on CAD before Fab"],
        },
        { key: "clauseRef", label: "Contract Clause Ref", type: "text" },
        {
          key: "protected",
          label: "Adequately Protected? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        { key: "comments", label: "PM Comments", type: "text" },
      ],
    },
    {
      key: "operationalStatus",
      label: "Operational Verification Status",
      type: "select",
      options: verificationStatuses,
      required: true,
      section: signOff,
    },
    {
      key: "nextStepDirective",
      label: "Next Step Directive",
      type: "text",
      systemFilled: true,
      shownFrom: { field: "operationalStatus", values: nextSteps },
      systemNote: "Shown once a status is chosen",
      section: signOff,
    },
    {
      key: "signOffDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: signOff,
    },
    {
      key: "pmSignature",
      label: "PM Signature",
      type: "signature",
      signedBy: ["PM"],
      section: signOff,
    },
  ],
})
