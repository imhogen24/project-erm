import { fileNamePart } from "@/lib/archive"

// D3.5, the approved invoice: once a milestone's draft invoice (D3.4) locks,
// the PM, acting as Head of Finance, checks it against D3.1. Every check
// Pass, Yes and the PM's signature approve and lock it, and the app renders
// the invoice the client receives. Any Fail, No and the signature lock this
// iteration and send the D3.4 back to the Finance Officer. One D3.5 per
// payment milestone cycle.

export const APPROVED_INVOICE = "D3.5"

export const PASS = "Pass"

export const FAIL = "Fail"

export const passOrFail = [PASS, FAIL]

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

// 2.0's checks, as the sheet words them. The bank, branch and payment
// window are filled in by the app.
export const qualityChecks = [
  {
    point: "Does the Total Amount perfectly match the milestone value in D3.1?",
  },
  { point: "Are the VAT/Tax calculations legally compliant and accurate?" },
  {
    point:
      "Are IMHO GEN's bank details ([Bank Name] / [Branch] Branch) correct?",
  },
  { point: "Is the [N]-day payment window explicitly stated?" },
]

// Beside check 2.1: the invoice's TOTAL AMOUNT DUE and D3.1's Amount Due
// for the milestone, so the PM can compare them.
export const amountsNote = "D3.4: [Invoice Total] · D3.1: [Milestone Value]"

// 3.0's tasks, both set Done as D3.5 is approved.
export const conversionTasks = [
  {
    task: "Has the approved invoice been exported as a static, non-editable PDF?",
    assignee: "Finance Officer",
  },
  {
    task: "Is the locked PDF named according to standard convention (e.g. IMHO_INV26_002_ClientName)?",
    assignee: "Finance Officer",
  },
]

// The approved invoice's file name, such as IMHO_INV26_002_AcmeFoods.pdf for
// invoice IMHO-INV26-002 to Acme Foods. The client's name keeps only the
// letters and digits a file name can hold.
export function invoiceFileName(
  invoiceNumber: string,
  clientName: string
): string {
  const number = invoiceNumber.trim().replaceAll(/[^A-Za-z0-9]+/g, "_")

  return `${number || "IMHO_INV"}_${fileNamePart(clientName) || "Client"}.pdf`
}

// Where the approved invoice of one milestone cycle is read, shown in the
// page, or saved as a file with `download`.
export function invoicePath(
  projectId: string,
  cycle: number,
  download = false
): string {
  return `/api/projects/${projectId}/invoices/${cycle}${download ? "?download=1" : ""}`
}
