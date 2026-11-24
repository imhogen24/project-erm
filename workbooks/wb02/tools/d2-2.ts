import {
  appendices,
  attachmentStatuses,
  coreVariables,
  deliverablesName,
  legalDirectives,
  paymentSchedules,
  phases,
  yesNo,
} from "@/lib/initial-draft"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Draft metadata"

const routing = "8.0 Draft routing"

const onLock = "Filled in when D2.2 is submitted"

// The source reference column every mapping table ends with.
const source = {
  key: "source",
  label: "Source Reference",
  type: "pdfPreview",
} as const

// The Tier 1 initial draft contract, opened once D2.1 locks. 1.0 is the
// system's. 2.0 to 4.0 start from the project's figures (server/contract) and
// the CA corrects them; 5.0 shows D1.15's deliverables as they are. Each table
// keeps the sheet's rows and can grow. Nobody approves it: the CA submits it
// once both routing answers are Yes, which locks it and opens D2.3. Tier 3
// projects use T3.D2.2a instead.
export const d22 = defineTool({
  id: "D2.2",
  name: "Initial Draft Contract",
  workbook: "wb02",
  tier: 1,
  locksOnSubmit: true,
  fills: Object.fromEntries(
    phases.map((phase) => [deliverablesName(phase), "system" as const])
  ),
  submitWhen: [
    {
      field: "initialDraftComplete",
      is: "Yes",
      message: "Answer Yes once the initial draft is complete",
    },
    {
      field: "readyForPmReview",
      is: "Yes",
      message: "Answer Yes once the draft is ready for the PM's review",
    },
  ],
  fields: [
    {
      key: "draftedBy",
      label: "Drafted By (Contract Admin)",
      type: "text",
      systemFilled: true,
      filledOnLock: "submittedBy",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "draftDate",
      label: "Date of Initial Draft",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "projectManager",
      label: "Assigned Project Manager",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "projectClientName",
      label: "Project/Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "referenceHandoff",
      label: "Reference Hand-off (D1.16)",
      type: "pdfPreview",
      source: { tool: "D1.16" },
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
      key: "coreVariables",
      label: "2.0 Core contract variables",
      type: "table",
      required: true,
      fixedRows: coreVariables.map((row) => ({
        variable: row.variable,
        source: row.source,
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "variable",
          label: "Variable Required",
          type: "text",
          required: true,
        },
        {
          key: "value",
          label: "Value / Input to map into Contract",
          type: "text",
          required: true,
        },
        source,
      ],
    },
    {
      key: "paymentMilestones",
      label: "3.0 Payment milestones (from D1.15)",
      type: "table",
      required: true,
      fixedRows: paymentSchedules.map((milestone) => ({
        milestone,
        source: "D1.15",
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "milestone",
          label: "Payment Schedule Number",
          type: "text",
          required: true,
        },
        {
          key: "schedule",
          label: "Payment Schedule",
          type: "text",
          required: true,
        },
        source,
      ],
    },
    {
      key: "projectMilestones",
      label: "4.0 Project milestones (from D1.15)",
      type: "table",
      required: true,
      fixedRows: phases.map((milestone) => ({
        milestone,
        source: "D1.15",
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "4" },
        {
          key: "milestone",
          label: "Project Milestone Number",
          type: "text",
          required: true,
        },
        {
          key: "timeline",
          label: "Contracted Timeline",
          type: "text",
          required: true,
        },
        source,
      ],
    },
    {
      key: "deliverables",
      label: "5.0 Project deliverables (from D1.15)",
      type: "table",
      required: true,
      fixedRows: phases.map((phase) => ({
        deliverableNumber: phase,
        deliverable: `[${deliverablesName(phase)}]`,
        source: "D1.15",
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "5" },
        {
          key: "deliverableNumber",
          label: "Project Deliverable Number",
          type: "text",
          required: true,
        },
        {
          key: "deliverable",
          label: "Deliverable",
          type: "longText",
          required: true,
        },
        source,
      ],
    },
    {
      key: "legalDirectives",
      label: "6.0 Project-specific legal directives (from D1.16)",
      type: "table",
      required: true,
      fixedRows: legalDirectives.map((category) => ({ category })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "6" },
        {
          key: "category",
          label: "Risk / Exclusion Category",
          type: "text",
          required: true,
        },
        {
          key: "clause",
          label: "Specific Clause Added to Draft Contract",
          type: "longText",
        },
        {
          key: "location",
          label: "Clause Location (Section #)",
          type: "text",
          placeholders: ["e.g. Section 4.1"],
        },
      ],
    },
    {
      key: "appendices",
      label: "7.0 Appendix attachment verification",
      type: "table",
      required: true,
      fixedRows: appendices.map((row) => ({ attachment: row.attachment })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "7" },
        {
          key: "attachment",
          label: "Required Attachment",
          type: "text",
          required: true,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: attachmentStatuses,
          required: true,
        },
        {
          key: "notes",
          label: "Notes",
          type: "text",
          placeholders: appendices.map((row) => row.note),
        },
      ],
    },
    {
      key: "initialDraftComplete",
      label: "Initial Draft Complete?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "readyForPmReview",
      label: "Ready for PM Review (D2.3)?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "routingDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: routing,
    },
    {
      key: "caSignature",
      label: "Contract Admin Signature",
      type: "signature",
      signedBy: ["CA"],
      section: routing,
    },
  ],
})
