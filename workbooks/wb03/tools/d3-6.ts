import { yesNo } from "@/lib/transmitted-invoice"
import { defineTool } from "@/server/tools/define-tool"

const dispatch = "1.0 Dispatch Metadata"

const script = "2.0 Standard Invoice Transmittal Script (Copy & Paste)"

const tracking = "3.0 Tracking & Follow-Up"

const whenSent = "Filled in when the invoice is sent"

// The transmitted invoice record, on both tiers, run once per payment
// milestone: a cycle's D3.6 opens when that cycle's D3.5 locks with Yes
// (server/workflow/wb03.ts). The Finance Officer checks the client's billing
// email and the covering message and presses Send
// (server/payments/transmitted-invoice), which emails the cycle's approved
// invoice PDF to the client, copying the PM, keeps a copy of the email,
// fills in when it went and the payment due date, sets 3.0 and locks D3.6.
// There is no Submit: Send locks it. Seven days before the due date the app
// reminds the client. The client reads it once it is sent.
export const d36 = defineTool({
  id: "D3.6",
  name: "Transmitted Invoice Record",
  workbook: "wb03",
  tier: "both",
  withoutSubmit: true,
  clientReadsOnceLocked: true,
  freezesOnceSet: { field: "dateSent", fields: ["sentTo", "script"] },
  fills: { N: "system" },
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: dispatch,
    },
    {
      key: "sentTo",
      label: "Sent To (Client Billing Email)",
      type: "email",
      required: true,
      section: dispatch,
    },
    {
      key: "ccBcc",
      label: "CC / BCC (Project Manager)",
      type: "text",
      systemFilled: true,
      section: dispatch,
    },
    {
      key: "dateSent",
      label: "Date Sent",
      type: "date",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "subject",
      label: "Subject Line",
      type: "text",
      systemFilled: true,
      section: dispatch,
    },
    {
      key: "timeSent",
      label: "Time Sent",
      type: "time",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "fileAttached",
      label: "File Attached",
      type: "pdfPreview",
      source: { approvedInvoice: true },
      section: dispatch,
    },
    {
      key: "paymentDueDate",
      label: "Payment Due Date",
      type: "date",
      systemFilled: true,
      systemNote: "Date Sent plus D3.1's payment window",
      section: dispatch,
    },
    {
      key: "script",
      label: "Standard Invoice Transmittal Script",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "sentEmailLink",
      label: "Link to Sent Email (CRM/Workspace)",
      type: "fileLink",
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
    {
      key: "paymentClockStarted",
      label: "Payment Clock Started? (Day 1 of [N])",
      type: "select",
      options: yesNo,
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
    {
      key: "reminderScheduled",
      label: "7-Day Reminder Scheduled?",
      type: "select",
      options: yesNo,
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
  ],
})
