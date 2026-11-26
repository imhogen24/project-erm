import {
  HALT_TOLD,
  YES,
  escalationHints,
  escalationSteps,
  yesNo,
} from "@/lib/overdue-account"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Overdue Metadata"

const penalty = "3.0 Late Penalty Calculation (Per D3.1 Terms)"

const routing = "4.0 Management Routing & Work Stoppage"

// The overdue accounts report, on both tiers, at most once per payment
// milestone. Only the app opens it: the daily follow-up job opens a cycle's
// D3.11 the day after its invoice falls due while its D3.8 is not approved
// (server/payments/overdue-account), and nothing waits for it
// (server/workflow/wb03.ts). 1.0 and 3.0's figures are the system's, worked
// out each time it is shown and kept as they are when it locks. The FO logs
// each follow-up in 2.0, adding rows, answers 3.0 and 4.0 and submits; the
// PM signs as Head of Finance, which approves and locks it. Locked with the
// halt answered Yes, the project's engineering work is halted
// (server/permissions/work-halted) until the cycle's D3.8 is approved.
export const d311 = defineTool({
  id: "D3.11",
  name: "Overdue Accounts Report",
  workbook: "wb03",
  tier: "both",
  writers: ["FO"],
  signInTurn: { order: ["hofSignature"], approves: "hofSignature" },
  announcesOnLock: {
    notifies: [...HALT_TOLD],
    message:
      "engineering work is halted until the milestone payment is reconciled",
    when: { field: "haltWork", is: YES },
  },
  submitNeeds: [
    {
      field: "escalated",
      message: "Answer whether the account is being escalated",
    },
    {
      field: "haltWork",
      message: "Answer whether engineering work must halt",
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
      key: "overdueInvoice",
      label: "Overdue Invoice Number",
      type: "pdfPreview",
      source: { approvedInvoice: true },
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
      key: "originalDueDate",
      label: "Original Due Date",
      type: "date",
      systemFilled: true,
      systemNote: "D3.6's Payment Due Date",
      section: metadata,
    },
    {
      key: "daysOverdue",
      label: "Days Overdue",
      type: "text",
      systemFilled: true,
      systemNote: "Days from the due date to today",
      section: metadata,
    },
    {
      key: "outstandingBalance",
      label: "Outstanding Balance (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "The invoice total less this milestone's D3.7 deposits",
      section: metadata,
    },
    {
      key: "assignedPm",
      label: "Assigned PM",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "escalationLog",
      label: "2.0 Escalation Log",
      type: "table",
      fixedRows: escalationSteps,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "action",
          label: "Action Taken",
          type: "text",
          required: true,
        },
        { key: "dateExecuted", label: "Date Executed", type: "date" },
        {
          key: "notes",
          label: "Client Response / Notes",
          type: "text",
          placeholders: escalationHints,
        },
      ],
    },
    {
      key: "penaltyRate",
      label: "Applicable Penalty Rate",
      type: "text",
      systemFilled: true,
      systemNote: "D3.1's Late Payment Penalty term",
      section: penalty,
    },
    {
      key: "penaltyAccrued",
      label: "Penalty Amount Accrued (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote:
        "The rate of the outstanding balance for each month late, a started month counting whole",
      section: penalty,
    },
    {
      key: "revisedInvoice",
      label: "Has a revised invoice including penalties been issued?",
      type: "select",
      options: yesNo,
      section: penalty,
    },
    {
      key: "revisedIssuedOn",
      label: "Date Issued",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when Yes is saved",
      datedOnSave: { field: "revisedInvoice", is: YES },
      section: penalty,
    },
    {
      key: "escalated",
      label:
        "Is this account being escalated to the Head of Operations for legal/collection action?",
      type: "select",
      options: yesNo,
      section: routing,
    },
    {
      key: "haltWork",
      label:
        "Has the PM been notified to immediately halt all engineering work?",
      type: "select",
      options: yesNo,
      section: routing,
    },
    {
      key: "hofSignature",
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
      systemNote: "Filled in when the Project Manager signs",
      section: routing,
    },
  ],
})
