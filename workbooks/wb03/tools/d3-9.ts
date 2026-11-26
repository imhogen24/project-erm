import { RECEIPT_SEQUENCE, paymentMethods, yesNo } from "@/lib/payment-receipt"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Receipt Metadata"

const script = "2.0 Standard Receipt Transmittal Script (Copy & Paste)"

const tracking = "3.0 Dispatch Tracking"

const whenSent = "Filled in when the receipt is sent"

// The payment receipt, on both tiers, run once per payment milestone: a
// cycle's D3.9 opens when that cycle's D3.8 is approved with the funds
// fully accounted for (server/workflow/wb03.ts). The app numbers the
// receipt when it is first saved and fills in who paid, the invoice and the
// amount. The Finance Officer picks how the client paid, checks the
// covering message and presses Send (server/payments/payment-receipt),
// which emails the receipt PDF to the address the cycle's invoice went to,
// copying the PM, keeps a copy of the email, fills in 3.0 and locks D3.9.
// There is no Submit: Send locks it. The client reads it once it is sent.
export const d39 = defineTool({
  id: "D3.9",
  name: "Payment Receipt",
  workbook: "wb03",
  tier: "both",
  withoutSubmit: true,
  clientReadsOnceLocked: true,
  freezesOnceSet: { field: "dateIssued", fields: ["paymentMethod", "script"] },
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "receiptNumber",
      label: "Receipt Number",
      type: "text",
      systemFilled: true,
      systemNote: "Given when the receipt is first saved",
      issuedFrom: RECEIPT_SEQUENCE,
      section: metadata,
    },
    {
      key: "dateIssued",
      label: "Date Issued",
      type: "date",
      systemFilled: true,
      systemNote: whenSent,
      section: metadata,
    },
    {
      key: "receivedFrom",
      label: "Received From (Client)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "paidAgainstInvoice",
      label: "Paid Against Invoice",
      type: "pdfPreview",
      source: { approvedInvoice: true },
      section: metadata,
    },
    {
      key: "paymentMethod",
      label: "Payment Method",
      type: "select",
      options: paymentMethods,
      required: true,
      section: metadata,
    },
    {
      key: "amountReceived",
      label: "Amount Received (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "D3.8's Actual Amount Cleared",
      section: metadata,
    },
    {
      key: "script",
      label: "Standard Receipt Transmittal Script",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "receiptAttached",
      label: "Receipt PDF Generated and Attached?",
      type: "select",
      options: yesNo,
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
    {
      key: "timeSent",
      label: "Time Sent",
      type: "time",
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
    {
      key: "sentEmailLink",
      label: "Link to Sent Email",
      type: "fileLink",
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
  ],
})
