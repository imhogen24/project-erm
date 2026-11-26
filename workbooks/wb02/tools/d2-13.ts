import {
  DONE,
  PENDING,
  pendingOrDone,
  vaultDocuments,
  yesNo,
} from "@/lib/archive"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Archive metadata"

const vault = "2.0 Permanent vault checklist"

const verification = "3.0 Vault lock verification"

const onLock = "Filled in when D2.13 is submitted"

// The archived contract record, on both tiers, opened when D2.12 locks. 1.0
// is the system's, with a link to the project's archive page. 2.0 shows each
// key contract document as a PDF to open, with its standard file name; the
// negotiation notes are not needed when the client accepted the draft as it
// was, nor the audit certificate for a contract signed on paper. The CA
// marks each Done, confirms all are there, signs and submits, which locks
// it. Nobody approves it.
export const d213 = defineTool({
  id: "D2.13",
  name: "Archived Contract Record",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  fills: { "Client Name": "system" },
  submitNeeds: [
    {
      field: "caSignature",
      message: "Sign as the Contract Admin before submitting",
    },
  ],
  submitWhen: [
    {
      field: "vault",
      column: "status",
      is: DONE,
      message: "Mark every document Done once it is in the vault",
    },
    {
      field: "allPresent",
      is: "Yes",
      message: "Answer Yes once every document is in the vault",
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
      key: "archivedBy",
      label: "Archived By (Admin)",
      type: "text",
      systemFilled: true,
      filledOnLock: "submittedBy",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "archiveDate",
      label: "Archive Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
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
      key: "vaultLink",
      label: "Permanent Vault Folder Link",
      type: "fileLink",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "vault",
      label: vault,
      type: "table",
      required: true,
      fixedRows: vaultDocuments,
      notNeeded: [
        {
          row: 2,
          when: {
            tool: "D2.7",
            field: "initialResponse",
            is: "Accepted as-is",
          },
        },
        {
          row: 4,
          when: { tool: "D2.12", field: "platform", is: "Physical Scan" },
        },
      ],
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "document",
          label: "Required Document for Archival",
          type: "pdfPreview",
        },
        {
          key: "status",
          label: "Status (Verified in Vault)",
          type: "select",
          options: pendingOrDone,
          startsAs: PENDING,
          required: true,
        },
        {
          key: "naming",
          label: "File Naming Convention Check",
          type: "text",
          required: true,
        },
      ],
    },
    {
      key: "allPresent",
      label: "Are all documents present in the secure cloud vault?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    {
      key: "caSignature",
      label: "Contract Admin Signature",
      type: "signature",
      signedBy: ["CA"],
      section: verification,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Contract Admin signs",
      section: verification,
    },
  ],
})
