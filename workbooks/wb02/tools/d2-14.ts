import {
  DONE,
  PENDING,
  launchTasks,
  pendingOrDone,
  yesNo,
} from "@/lib/initiation"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Initiation metadata"

const clearance = "2.0 Financial clearance (The trigger)"

const launch = "3.0 Engineering launch directive"

const confirmation = "4.0 Launch confirmation"

const routing = "5.0 Final routing"

// The phase initiation notice, the last tool of Workbook 2, on both tiers,
// opened when D2.13 locks. 1.0 is the system's. The CA starts from D2.12's
// invoice number and the advance due, types the day the payment cleared,
// which the start date follows, and the target date follows the start plus
// D2.6's timeline, each until changed by hand. The CA submits; then the FO
// signs that the money cleared, and the PM signs the green light, which
// approves and locks it and marks the PM's 4.0 task Done.
export const d214 = defineTool({
  id: "D2.14",
  name: "Phase Initiation Notice",
  workbook: "wb02",
  tier: "both",
  signInTurn: {
    order: ["financeSignature", "greenLightSignature"],
    approves: "greenLightSignature",
  },
  submitWhen: [
    {
      field: "launchTasks",
      column: "status",
      is: DONE,
      message: "Mark the tracking database task Done before submitting",
    },
    {
      field: "authorized",
      is: "Yes",
      message: "Answer Yes once engineering may begin billable work",
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
      key: "noticeDate",
      label: "Notice Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when D2.14 is submitted",
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
      key: "totalTimeline",
      label: "Total Project Timeline",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "invoiceNumber",
      label: "Advance Invoice Number",
      type: "text",
      required: true,
      section: clearance,
    },
    {
      key: "amountExpected",
      label: "Amount Expected",
      type: "currency",
      required: true,
      section: clearance,
    },
    {
      key: "paymentDate",
      label: "Date Payment Cleared IMHO GEN Bank Account",
      type: "date",
      required: true,
      section: clearance,
    },
    {
      key: "financeSignature",
      label: "Finance Clearance Signature",
      type: "signature",
      signedBy: ["FO"],
      section: clearance,
    },
    {
      key: "startDate",
      label: "Official Project Start Date (Day 1)",
      type: "date",
      required: true,
      follows: { field: "paymentDate" },
      section: launch,
    },
    {
      key: "targetDate",
      label: "Target Delivery Date",
      type: "date",
      required: true,
      follows: { field: "startDate", plusDurationOf: "totalTimeline" },
      section: launch,
    },
    {
      key: "executedContract",
      label: "Link to Executed Contract (For PM reference)",
      type: "pdfPreview",
      source: { upload: { tool: "D2.12", field: "executedPdf" } },
      section: launch,
    },
    {
      key: "launchTasks",
      label: confirmation,
      type: "table",
      required: true,
      fixedRows: launchTasks,
      setOnSign: [
        {
          row: 1,
          column: "status",
          is: DONE,
          signature: "greenLightSignature",
        },
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
        "Is the Engineering Team officially authorized to begin billable work?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "greenLightSignature",
      label: "Head of Operations / R&D Signature",
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
