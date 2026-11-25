import {
  DONE,
  PENDING,
  SCAN,
  financeTasks,
  pendingOrDone,
  platforms,
  yesNo,
} from "@/lib/executed-contract"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Execution metadata"

const audit = "2.0 Digital audit record"

const trigger = "3.0 Initial financial trigger"

const routing = "4.0 Execution routing"

// The executed contract and audit trail, on both tiers, opened when D2.11
// locks. 1.0 is the system's: who signed and when, and the contract's value
// and advance (server/contract/executed-contract). For a contract signed in
// the app, 2.0 starts on the signed contract with its signature page and the
// signing log, both made by the app; for one signed on paper, the CA uploads
// the scan. The CA confirms Finance has the contract and issued the advance
// invoice, signs and submits, and the PM approves, which locks it and opens
// Workbook 3.
export const d212 = defineTool({
  id: "D2.12",
  name: "Executed Contract & Audit Trail",
  workbook: "wb02",
  tier: "both",
  submitNeeds: [
    {
      field: "auditCertificate",
      unless: { field: "platform", is: SCAN },
      message: "Attach the digital audit certificate",
    },
    {
      field: "caSignature",
      message: "Sign as the Contract Admin before submitting",
    },
  ],
  submitWhen: [
    {
      field: "financeTrigger",
      column: "status",
      is: DONE,
      message: "Mark both Finance tasks Done before submitting",
    },
    {
      field: "fullyExecuted",
      is: "Yes",
      message: "Answer Yes once the contract is executed and the invoice sent",
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
      key: "dateExecuted",
      label: "Date Fully Executed",
      type: "date",
      systemFilled: true,
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
      key: "clientSignatory",
      label: "Client Signatory",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "imhogenSignatory",
      label: "IMHOGEN Signatory",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "totalContractValue",
      label: "Total Contract Value",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "advanceDue",
      label: "Advance Payment Due",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "platform",
      label: "Document Platform Used",
      type: "select",
      options: platforms,
      required: true,
      section: audit,
    },
    {
      key: "executedPdf",
      label: "Link to Executed PDF",
      type: "fileLink",
      pdfOnly: true,
      required: true,
      section: audit,
    },
    {
      key: "auditCertificate",
      label: "Link to Digital Audit Certificate",
      type: "fileLink",
      pdfOnly: true,
      section: audit,
    },
    {
      key: "financeTrigger",
      label: trigger,
      type: "table",
      required: true,
      fixedRows: financeTasks,
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
      key: "invoiceNumber",
      label: "Invoice Number Issued",
      type: "text",
      required: true,
      placeholder: "e.g. IMHO-INV26-ADV-010",
      section: trigger,
    },
    {
      key: "invoiceDate",
      label: "Date Issued",
      type: "date",
      required: true,
      section: trigger,
    },
    {
      key: "fullyExecuted",
      label: "Is the contract fully executed and the first invoice sent?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "caSignature",
      label: "Contract Admin Signature",
      type: "signature",
      signedBy: ["CA"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Contract Admin signs",
      section: routing,
    },
  ],
})
