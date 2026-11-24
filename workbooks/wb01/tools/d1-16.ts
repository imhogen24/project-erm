import {
  checklistStatuses,
  handoffChecklist,
  handoffDirectives,
} from "@/lib/handoff"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Handoff metadata"

const transfer = "2.0 Project brief & budget transfer"

const directives =
  "3.0 Contracting directives (critical risks & exclusions to enforce in contract)"

const checklist = "4.0 System handoff & archival checklist (PID 1.5.2 & 1.5.3)"

const signOff = "5.0 Final sign-off"

// The minutes of the meeting where engineering hands the project to
// contracting, on both tiers. Who hands off and receives, the client, the
// request ID and the project value (D1.15's budget, or T3.D1.15a's total) are
// the system's (server/handoff); 2.0 shows the brief itself as a PDF. The LE
// types the meeting, the scope summary, the payment terms, the directives and
// the checklist, signs the engineering release and submits; the PM signs the
// contracting acceptance and approves, which locks it and opens Workbook 2.
export const d116 = defineTool({
  id: "D1.16",
  name: "Handoff Meeting Minutes",
  workbook: "wb01",
  fields: [
    {
      key: "requestId",
      label: "Reference Request ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "meetingDate",
      label: "Meeting Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "meetingTime",
      label: "Meeting Time",
      type: "time",
      required: true,
      section: metadata,
    },
    {
      key: "leadEngineer",
      label: "Lead Engineer (Handing Off)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "contractAdmin",
      label: "Contract Admin (Receiving)",
      type: "text",
      systemFilled: true,
      systemNote: "No Contract Admin on the project yet",
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
      key: "projectValue",
      label: "Project Value (GHS)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    // The sheet names D1.15; on a Tier 3 project the preview shows T3.D1.15a.
    {
      key: "referenceDocument",
      label: "Reference Document",
      type: "pdfPreview",
      section: transfer,
      source: { tool: "D1.15" },
    },
    {
      key: "scopeSummary",
      label: "Scope Summary",
      type: "longText",
      required: true,
      section: transfer,
    },
    {
      key: "paymentTerms",
      label: "Payment Terms Agreed",
      type: "text",
      required: true,
      section: transfer,
    },
    {
      key: "directives",
      label: "Contracting directives",
      type: "table",
      required: true,
      section: directives,
      lockedRows: handoffDirectives.map((each) => each.category),
      columns: [
        {
          key: "category",
          label: "Risk / Exclusion Category",
          type: "text",
          required: true,
        },
        {
          key: "directive",
          label: "Specific Directive for Contract Admin",
          type: "longText",
          required: true,
        },
        {
          key: "source",
          label: "Source Reference",
          type: "text",
          required: true,
        },
      ],
    },
    {
      key: "checklist",
      label: "System handoff & archival checklist",
      type: "table",
      required: true,
      section: checklist,
      prefilledRows: handoffChecklist.map((each) => each.task),
      columns: [
        {
          key: "task",
          label: "Task / Action Item",
          type: "text",
          required: true,
        },
        { key: "assignee", label: "Assignee", type: "text", required: true },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: checklistStatuses,
          required: true,
        },
      ],
    },
    {
      key: "engineeringRelease",
      label: "Engineering Release",
      type: "signature",
      signedBy: ["LE"],
      section: signOff,
    },
    {
      key: "contractingAcceptance",
      label: "Contracting Acceptance",
      type: "signature",
      signedBy: ["PM"],
      section: signOff,
    },
  ],
})
