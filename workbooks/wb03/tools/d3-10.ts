import {
  DONE,
  NO,
  PENDING,
  YES,
  pendingOrDone,
  routingTasks,
  yesNo,
} from "@/lib/unblock-notice"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Unblock Metadata"

const clearance = "2.0 Financial Clearance Confirmation"

const launch = "3.0 Engineering Launch Directive"

const routing = "4.0 Internal Routing"

const authorization = "5.0 Final Authorization"

// The phase unblock notice, on both tiers, run once per payment milestone:
// a cycle's D3.10 opens when that cycle's D3.9 is sent (server/workflow/
// wb03.ts). 1.0 and 2.0's invoice and amount are the system's. 3.0 starts
// on the next D3.1 milestone (server/payments/unblock-notice). The FO
// answers the holds and authorization, ticks off 4.0, adding any rows, and
// submits; the PM signs as Head of Finance, which approves and locks it,
// marks the PM's 4.0 task Done and tells the PM, FO and HE the phase may
// start. An approved D3.10 is what WB04 waits on.
export const d310 = defineTool({
  id: "D3.10",
  name: "Phase Unblock Notice",
  workbook: "wb03",
  tier: "both",
  signInTurn: { order: ["hofSignature"], approves: "hofSignature" },
  announcesOnLock: {
    notifies: ["PM", "FO", "HE"],
    message: "[phaseAuthorized] may start",
  },
  submitWhen: [
    {
      field: "financialHolds",
      is: NO,
      message: "The next phase stays locked while financial holds remain",
    },
    {
      field: "routingTasks",
      column: "status",
      is: DONE,
      message: "Mark every routing task Done before submitting",
    },
    {
      field: "authorized",
      is: YES,
      message: "Answer Yes once engineering may resume billable work",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "noticeDate",
      label: "Notice Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when D3.10 is submitted",
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
      key: "assignedPm",
      label: "Assigned Project Manager",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "issuingFo",
      label: "Issuing Finance Officer",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "invoiceCleared",
      label: "Invoice Cleared",
      type: "pdfPreview",
      source: { approvedInvoice: true },
      section: clearance,
    },
    {
      key: "amountSecured",
      label: "Amount Secured (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "D3.8's Actual Amount Cleared",
      section: clearance,
    },
    {
      key: "financialHolds",
      label: "Are there any financial holds remaining on this project?",
      type: "select",
      options: yesNo,
      required: true,
      section: clearance,
    },
    {
      key: "phaseAuthorized",
      label: "Phase Authorized to Begin",
      type: "text",
      required: true,
      section: launch,
    },
    {
      key: "phaseBudget",
      label: "Total Phase Budget Available (If applicable)",
      type: "text",
      section: launch,
    },
    {
      key: "routingTasks",
      label: routing,
      type: "table",
      required: true,
      fixedRows: routingTasks,
      setOnSign: [
        { row: 1, column: "status", is: DONE, signature: "hofSignature" },
      ],
      columns: [
        {
          key: "task",
          label: "Task / Action Item",
          type: "text",
          required: true,
        },
        { key: "assignee", label: "Assignee", type: "text" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: pendingOrDone,
          startsAs: PENDING,
          required: true,
        },
      ],
    },
    {
      key: "authorized",
      label:
        "Is the Engineering Team officially authorized to resume billable work?",
      type: "select",
      options: yesNo,
      required: true,
      section: authorization,
    },
    {
      key: "hofSignature",
      label: "Head of Finance Signature",
      type: "signature",
      signedBy: ["PM"],
      section: authorization,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: authorization,
    },
  ],
})
