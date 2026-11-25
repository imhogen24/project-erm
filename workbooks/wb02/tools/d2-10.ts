import {
  CONTRACT_ADMIN,
  DONE,
  PENDING as TASK_PENDING,
  pendingOrDone,
  yesNo,
} from "@/lib/baseline"
import {
  PENDING,
  UPDATED,
  amendmentStatuses,
  finalTasks,
} from "@/lib/final-contract"
import { NEGOTIATION_NOTES } from "@/lib/negotiation-notes"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Final edit metadata"

const amendments = "2.0 Negotiation amendment tracker"

const reVerification =
  "3.0 Financial re-verification (If pricing changed during negotiation)"

const conversion = "4.0 Document conversion & lock"

const routing = "5.0 Final routing"

const onLock = "Filled in when D2.10 is submitted"

const negotiated = { locked: NEGOTIATION_NOTES }

// The finalized contract, on both tiers, opened when D2.9 locks with Terms
// Agreed, or straight after D2.7 when the client accepted the draft as it
// is. 2.0 starts on D2.9's agreed concessions (server/contract/final-
// contract), empty when nobody negotiated. 3.0 is only for a negotiated
// contract: the FO signs that the new pricing still recovers overheads, and
// is told once the record is started. The CA submits once every amendment is
// Updated, every task Done and the contract ready, which locks it and opens
// D2.11. Nobody approves it.
export const d210 = defineTool({
  id: "D2.10",
  name: "Finalized Contract",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  submitWhen: [
    {
      field: "amendments",
      column: "status",
      is: UPDATED,
      orNoRows: true,
      message: "Mark every amendment Updated before finalizing",
    },
    {
      field: "finalTasks",
      column: "status",
      is: DONE,
      message: "Mark every task Done before finalizing",
    },
    {
      field: "readyForSignature",
      is: "Yes",
      message: "Answer Yes once the contract is ready for signature routing",
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
      key: "editedBy",
      label: "Edited By (Contract Admin)",
      type: "text",
      systemFilled: true,
      filledOnLock: "submittedBy",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "finalEditDate",
      label: "Date of Final Edit",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "meetingNotes",
      label: "Reference Meeting Notes",
      type: "pdfPreview",
      source: { tool: NEGOTIATION_NOTES },
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
      key: "amendments",
      label: amendments,
      type: "table",
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "concession",
          label: "Agreed Concession (From D2.9)",
          type: "longText",
          required: true,
          placeholders: ["e.g. 5% Discount applied"],
        },
        {
          key: "section",
          label: "Contract Section Updated",
          type: "text",
          required: true,
          placeholders: ["e.g. Section 3.1"],
        },
        {
          key: "newText",
          label: "New Contract Text Inserted (Exact Wording)",
          type: "longText",
          required: true,
          placeholders: ['e.g. "Total Contract Value is GHS 164,825.00"'],
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: amendmentStatuses,
          startsAs: PENDING,
          required: true,
        },
      ],
    },
    {
      key: "pricingQuestion",
      label: "Pricing re-verification",
      type: "instruction",
      content:
        "Has the new pricing structure been verified to ensure minimum overhead recovery?",
      onlyWhen: negotiated,
      section: reVerification,
    },
    {
      key: "financeSignature",
      label: "Finance Rep",
      type: "signature",
      signedBy: ["FO"],
      askedOnStart: true,
      onlyWhen: negotiated,
      section: reVerification,
    },
    {
      key: "finalTasks",
      label: conversion,
      type: "table",
      required: true,
      fixedRows: finalTasks.map((task) => ({
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
          startsAs: TASK_PENDING,
          required: true,
        },
      ],
    },
    {
      key: "readyForSignature",
      label: "Contract finalized and ready for signature routing (D2.11)?",
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
