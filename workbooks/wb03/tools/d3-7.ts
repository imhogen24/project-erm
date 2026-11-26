import {
  CONTINUE_WAITING,
  NO,
  PROCEED,
  YES,
  actions,
  yesNo,
} from "@/lib/bank-statement-log"
import { defineTool } from "@/server/tools/define-tool"

const audit = "1.0 Audit Metadata"

const funds = "2.0 Incoming Funds Detected (Scan for this specific project)"

const discrepancy = "3.0 Discrepancy Check"

const routing = "4.0 Routing Directive"

const earlier = "Earlier Checks"

const onSubmit = "Filled in when the check is submitted"

const whenFunds = { field: "fundsDeposited", is: YES }

const unlessNoFunds = { field: "fundsDeposited", is: NO }

// The daily bank statement log, on both tiers, run once per payment
// milestone: a cycle's D3.7 opens when that cycle's D3.6 is sent
// (server/workflow/wb03.ts). Each check is one iteration. The Finance
// Officer records whether the client's money came in, and how much; the
// app works out the variance against the invoice's TOTAL AMOUNT DUE. The FO
// picks the next step, signs and submits, which locks the check: nobody
// approves it. With Continue waiting the next check opens straight away,
// empty, and the locked one is kept under Earlier Checks, newest first
// (`repeatsWhile`). Proceed ends the log for the milestone. While a check
// is open the app reminds the FO each working day at 9:00
// (server/payments/bank-statement-log).
export const d37 = defineTool({
  id: "D3.7",
  name: "Daily Bank Statement Log",
  workbook: "wb03",
  tier: "both",
  locksOnSubmit: true,
  repeatsWhile: {
    field: "actionRequired",
    is: CONTINUE_WAITING,
    keepsIn: "earlierChecks",
  },
  fills: { "Client Name": "system" },
  submitNeeds: [
    {
      field: "amountDeposited",
      message: "Type the amount deposited",
      unless: unlessNoFunds,
    },
    {
      field: "reference",
      message: "Type the transaction reference or narration",
      unless: unlessNoFunds,
    },
    {
      field: "valueDate",
      message: "Pick the date the funds cleared",
      unless: unlessNoFunds,
    },
    {
      field: "amountMatches",
      message: "Say whether the amount matches the invoice",
      unless: unlessNoFunds,
    },
    {
      field: "foSignature",
      message: "Sign as the Checking Officer before submitting",
    },
  ],
  submitWhen: [
    {
      field: "fundsDeposited",
      is: YES,
      when: { field: "actionRequired", is: PROCEED },
      message: "Proceed only once funds are in: otherwise Continue waiting",
    },
    {
      field: "amountMatches",
      is: YES,
      matches: { field: "variance", equals: 0 },
      message: "Answer Yes only when the variance is 0.00",
    },
    {
      field: "amountMatches",
      is: NO,
      matches: { field: "variance", otherThan: 0 },
      message: "Answer No only when the variance is not 0.00",
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
      key: "checkingOfficer",
      label: "Checking Officer",
      type: "text",
      systemFilled: true,
      filledOnLock: "submittedBy",
      systemNote: onSubmit,
      section: audit,
    },
    {
      key: "dateOfCheck",
      label: "Date of Check",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onSubmit,
      section: audit,
    },
    {
      key: "accountChecked",
      label: "Account Checked",
      type: "text",
      systemFilled: true,
      section: audit,
    },
    {
      key: "timeOfCheck",
      label: "Time of Check",
      type: "time",
      systemFilled: true,
      filledOnLock: "lockedTime",
      systemNote: onSubmit,
      section: audit,
    },
    {
      key: "fundsDeposited",
      label: "Were any funds deposited by [Client Name] in the last 24 hours?",
      type: "select",
      options: yesNo,
      required: true,
      section: funds,
    },
    {
      key: "amountDeposited",
      label: "Amount Deposited (GHS)",
      type: "currency",
      onlyWhen: whenFunds,
      section: funds,
    },
    {
      key: "reference",
      label: "Transaction Reference / Narration",
      type: "text",
      placeholder: "e.g. TRF FROM DANIEL ASANTI - INV002",
      onlyWhen: whenFunds,
      section: funds,
    },
    {
      key: "valueDate",
      label: "Value Date (Date funds actually cleared)",
      type: "date",
      onlyWhen: whenFunds,
      section: funds,
    },
    {
      key: "amountMatches",
      label:
        "Does the deposited amount exactly match the Expected Amount in D3.6?",
      type: "select",
      options: yesNo,
      onlyWhen: whenFunds,
      section: discrepancy,
    },
    {
      key: "expectedAmount",
      label: "Expected Amount (TOTAL AMOUNT DUE)",
      type: "currency",
      systemFilled: true,
      section: discrepancy,
    },
    {
      key: "variance",
      label: "Variance (GHS)",
      type: "currency",
      systemFilled: true,
      systemNote: "Amount Deposited less the Expected Amount",
      section: discrepancy,
    },
    {
      key: "actionRequired",
      label: "Action Required",
      type: "select",
      options: actions,
      required: true,
      section: routing,
    },
    {
      key: "foSignature",
      label: "Checking Officer Signature",
      type: "signature",
      signedBy: ["FO"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Finance Officer signs",
      section: routing,
    },
    {
      key: "earlierChecks",
      label: "Earlier Checks (newest first)",
      type: "table",
      readOnly: true,
      section: earlier,
      columns: [
        { key: "dateOfCheck", label: "Date of Check", type: "date" },
        { key: "timeOfCheck", label: "Time of Check", type: "time" },
        { key: "checkingOfficer", label: "Checking Officer", type: "text" },
        { key: "fundsDeposited", label: "Funds Deposited?", type: "text" },
        {
          key: "amountDeposited",
          label: "Amount Deposited (GHS)",
          type: "currency",
        },
        { key: "reference", label: "Reference / Narration", type: "text" },
        { key: "valueDate", label: "Value Date", type: "date" },
        { key: "variance", label: "Variance (GHS)", type: "currency" },
        { key: "actionRequired", label: "Action Required", type: "text" },
      ],
    },
  ],
})
