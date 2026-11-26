import {
  DONE,
  FAIL,
  NO,
  PASS,
  PENDING,
  YES,
  amountsNote,
  conversionTasks,
  passOrFail,
  pendingOrDone,
  qualityChecks,
  yesNo,
} from "@/lib/approved-invoice"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Approval Metadata"

const routing = "4.0 Approval Routing"

// The approved invoice, on both tiers, run once per payment milestone: a
// cycle's D3.5 opens when that cycle's D3.4 locks (server/workflow/wb03.ts).
// The app has no Head of Finance, so the PM fills it in as one. 1.0 is the
// system's, with the cycle's D3.4 as the Reference Draft. The PM marks each
// check Pass or Fail, a Fail with a comment, answers 4.0, signs and submits,
// which locks it. Yes needs every check Pass: it approves the invoice, sets
// both 3.0 tasks Done, and the app renders the invoice PDF from the locked
// D3.4 (server/payments/invoice-pdf). No needs a Fail: it sends the D3.4
// back to the Finance Officer as a new iteration, with the PM's comments,
// and D3.5 reopens for the PM once the FO locks it again.
export const d35 = defineTool({
  id: "D3.5",
  name: "Approved Invoice",
  workbook: "wb03",
  tier: "both",
  writers: ["PM"],
  locksOnSubmit: true,
  sendsBackTo: {
    field: "authorized",
    is: NO,
    tools: [DRAFT_INVOICE],
    explainedBy: { field: "checklist", column: "comments" },
  },
  fills: {
    "Bank Name": "system",
    Branch: "system",
    N: "system",
    "Invoice Total": "system",
    "Milestone Value": "system",
  },
  submitNeeds: [
    {
      field: "pmSignature",
      message: "Sign as the Head of Finance before submitting",
    },
  ],
  submitWhen: [
    {
      field: "checklist",
      column: "status",
      is: PASS,
      when: { field: "authorized", is: YES },
      message: "Answer Yes only when every check is Pass",
    },
    {
      field: "checklist",
      column: "status",
      some: FAIL,
      when: { field: "authorized", is: NO },
      message: "Answer No only when a check is Fail",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "reviewingOfficer",
      label: "Reviewing Officer (Head of Finance)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "dateReceived",
      label: "Date Received for Review",
      type: "date",
      systemFilled: true,
      systemNote: "The day this milestone's D3.4 was submitted",
      section: metadata,
    },
    {
      key: "referenceDraft",
      label: "Reference Draft",
      type: "pdfPreview",
      source: { tool: DRAFT_INVOICE },
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
      key: "checklist",
      label: "2.0 Financial Quality Control Checklist",
      type: "table",
      required: true,
      fixedRows: qualityChecks,
      fixedRowNotes: [amountsNote],
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "point",
          label: "Verification Point",
          type: "text",
          required: true,
        },
        {
          key: "status",
          label: "Status (Pass / Fail)",
          type: "select",
          options: passOrFail,
          required: true,
        },
        {
          key: "comments",
          label: "Finance Head Comments",
          type: "text",
          requiredWhen: {
            column: "status",
            is: FAIL,
            message: "Say what to fix",
          },
        },
      ],
    },
    {
      key: "conversion",
      label: "3.0 Document Conversion & Lock",
      type: "table",
      fixedRows: conversionTasks,
      setOnLock: [0, 1].map((row) => ({
        row,
        column: "status",
        is: DONE,
        when: { field: "authorized", is: YES },
      })),
      columns: [
        { key: "task", label: "Task / Action Item", type: "text" },
        { key: "assignee", label: "Assignee", type: "text" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: pendingOrDone,
          startsAs: PENDING,
        },
      ],
    },
    {
      key: "authorized",
      label:
        "Is the Invoice locked and authorized for client transmittal (D3.6)?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "pmSignature",
      label: "Head of Finance Signature",
      type: "signature",
      signedBy: ["PM"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Head of Finance signs",
      section: routing,
    },
  ],
})
