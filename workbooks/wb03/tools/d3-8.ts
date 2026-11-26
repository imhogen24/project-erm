import { BANK_STATEMENT_LOG } from "@/lib/bank-statement-log"
import {
  DONE,
  NO,
  PENDING,
  YES,
  accountingTasks,
  pendingOrDone,
  yesNo,
} from "@/lib/reconciled-payment"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Reconciliation Metadata"

const matching =
  "2.0 Matching & Verification (Connecting the Bank to the Invoice)"

const approval = "4.0 Reconciliation Approval"

const onSubmit = "Filled in when the Finance Officer submits"

// The reconciled payment log, on both tiers, run once per payment
// milestone: a cycle's D3.8 opens when that cycle's D3.7 is submitted with
// Proceed (server/workflow/wb03.ts). 1.0 and 2.0 are the system's: 2.0
// adds up every deposit the cycle's bank checks logged against the
// invoice's TOTAL AMOUNT DUE. The FO answers whether the funds are fully
// accounted for and whether it is ready for the receipt, the two agreeing,
// signs and submits. The PM, as Head of Finance, approves a Yes, which
// locks it, sets both 3.0 tasks Done and marks the milestone's invoice PAID
// (server/payments/reconciled-submit). A No cannot be approved: the PM
// sends it back, which locks this iteration and reopens the cycle's D3.7 as
// a new check; D3.8 reopens once that check proceeds again. The PM can also
// send a Yes back to the FO.
export const d38 = defineTool({
  id: "D3.8",
  name: "Reconciled Payment Log",
  workbook: "wb03",
  tier: "both",
  sendsBackTo: {
    field: "fundsAccounted",
    is: NO,
    tools: [BANK_STATEMENT_LOG],
  },
  submitNeeds: [
    {
      field: "foSignature",
      message: "Sign as the Finance Officer before submitting",
    },
  ],
  submitWhen: [
    {
      field: "readyForReceipt",
      is: YES,
      when: { field: "fundsAccounted", is: YES },
      message: "Answer Yes while the funds are fully accounted for",
    },
    {
      field: "readyForReceipt",
      is: NO,
      when: { field: "fundsAccounted", is: NO },
      message: "Answer No while the funds are not fully accounted for",
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
      key: "reconcilingOfficer",
      label: "Reconciling Officer",
      type: "text",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "dateReconciled",
      label: "Date Reconciled",
      type: "date",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "referenceInvoice",
      label: "Reference Invoice",
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
      key: "expectedAmount",
      label: "Expected Invoice Amount (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "The invoice's TOTAL AMOUNT DUE",
      section: matching,
    },
    {
      key: "actualCleared",
      label: "Actual Amount Cleared (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "Every Amount Deposited in this milestone's D3.7, added up",
      section: matching,
    },
    {
      key: "dateCleared",
      label: "Date Cleared in Bank",
      type: "date",
      systemFilled: true,
      systemNote: "The latest Value Date among those deposits",
      section: matching,
    },
    {
      key: "variance",
      label: "Variance (Bank Fees/Shortage)",
      type: "currency",
      systemFilled: true,
      systemNote: "Actual Amount Cleared less the Expected Invoice Amount",
      section: matching,
    },
    {
      key: "fundsAccounted",
      label:
        "Are the funds fully accounted for and legally belonging to IMHO GEN?",
      type: "select",
      options: yesNo,
      required: true,
      section: matching,
    },
    {
      key: "accounting",
      label: "3.0 Accounting System Update",
      type: "table",
      fixedRows: accountingTasks,
      setOnLock: [0, 1].map((row) => ({
        row,
        column: "status",
        is: DONE,
        when: { field: "fundsAccounted", is: YES },
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
      key: "readyForReceipt",
      label: "Reconciliation Complete and Ready for Receipt Generation (D3.9)?",
      type: "select",
      options: yesNo,
      required: true,
      section: approval,
    },
    {
      key: "foSignature",
      label: "Finance Officer Signature",
      type: "signature",
      signedBy: ["FO"],
      section: approval,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Finance Officer signs",
      section: approval,
    },
  ],
})
