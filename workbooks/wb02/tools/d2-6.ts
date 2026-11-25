import {
  CONTRACT_ADMIN,
  DONE,
  archiveTasks,
  contractVariables,
  pendingOrDone,
  yesNo,
} from "@/lib/baseline"
import { EXECUTIVE_REVIEW } from "@/lib/executive-review"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Draft lock metadata"

const verification = "4.0 Lock verification"

const onLock = "Filled in when D2.6 is submitted"

// The baseline the Contract Admin freezes, on both tiers, opened once the
// Head of R&D / Ops locks D2.5 with Approved for Client Transmission. 1.0 is
// the system's. 2.0 starts from the draft's figures where it holds them
// (server/contract/baseline), and 3.0 on the sheet's archive tasks. The CA
// submits once every task is Done and the baseline is ready for D2.7, which
// locks it. Negotiation reads its limits, so it can never change after: no
// change request can be raised on it.
export const d26 = defineTool({
  id: "D2.6",
  name: "Internally Approved Draft",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  noChangeRequests: true,
  submitWhen: [
    {
      field: "archiveTasks",
      column: "status",
      is: DONE,
      message: "Mark every task Done before locking the baseline",
    },
    {
      field: "readyForTransmittal",
      is: "Yes",
      message: "Answer Yes once the baseline is ready for transmittal",
    },
  ],
  fields: [
    {
      key: "lockExecutedBy",
      label: "Lock Executed By (Admin)",
      type: "text",
      systemFilled: true,
      filledOnLock: "submittedBy",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "dateLocked",
      label: "Date Locked",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "executiveApproval",
      label: "Executive Approval Ref",
      type: "pdfPreview",
      source: { tool: EXECUTIVE_REVIEW },
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
      key: "baseline",
      label: "2.0 Immutable baseline record (pre-negotiation)",
      type: "table",
      required: true,
      fixedRows: contractVariables.map((row) => ({ variable: row.variable })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "variable",
          label: "Contract Variable",
          type: "text",
          required: true,
        },
        {
          key: "baselineValue",
          label: "Baseline Value (Approved in D2.5)",
          type: "text",
          required: true,
          placeholders: contractVariables.map((row) => row.baselineHint),
        },
        {
          key: "absoluteLimit",
          label: "Absolute Limit (Walk-away point during negotiation)",
          type: "text",
          placeholders: contractVariables.map((row) => row.limitHint),
        },
      ],
    },
    {
      key: "archiveTasks",
      label: "3.0 Document conversion & archive",
      type: "table",
      required: true,
      fixedRows: archiveTasks.map((task) => ({
        task,
        assignee: CONTRACT_ADMIN,
      })),
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
          required: true,
        },
      ],
    },
    {
      key: "readyForTransmittal",
      label: "Baseline Locked and Ready for Transmittal (D2.7)?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    {
      key: "verificationDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: verification,
    },
    {
      key: "caSignature",
      label: "Contract Admin Signature",
      type: "signature",
      signedBy: ["CA"],
      section: verification,
    },
  ],
})
