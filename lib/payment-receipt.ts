import { numberedFileName } from "@/lib/sequences"

// D3.9, the payment receipt: once a milestone's payment is reconciled
// (D3.8 approved), the Finance Officer picks how the client paid, checks
// the covering message and presses Send. The app numbers the receipt,
// emails its PDF to the client, copies the PM, keeps a copy of the email and
// locks D3.9. One D3.9 per payment milestone cycle.

export const PAYMENT_RECEIPT = "D3.9"

// The running number every receipt takes, such as IMHO-REC26-002.
export const RECEIPT_SEQUENCE = "receipt"

export const BANK_TRANSFER = "Bank Transfer"

export const paymentMethods = [BANK_TRANSFER, "Cheque", "Mobile Money", "Cash"]

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// The sheet's subject line, with the receipt number and the project's name
// filled in. A value not known yet keeps its [name].
export function receiptSubjectFor(receiptNumber: string, projectName: string) {
  return `IMHO GEN Receipt ${receiptNumber || "[Receipt #]"} - ${projectName || "[Project Name]"}`
}

export type ReceiptScriptValues = {
  clientName?: string
  amount?: string
  invoiceNumber?: string
}

// The sheet's covering message, with what the app knows filled in. The
// sheet's fourth paragraph stops mid-sentence, so it is finished here. A
// value not known yet keeps the sheet's [name], so the FO sees what is
// missing.
export function receiptScriptFor(values: ReceiptScriptValues): string {
  return [
    `Dear ${values.clientName || "[Client Name]"}`,
    `This email serves as official confirmation that IMHOGEN LTD has successfully received your payment of ${values.amount || "[Insert Amount GHS]"} regarding Invoice ${values.invoiceNumber || "[Insert Inv #]"}.`,
    "Please find your official payment receipt attached for your accounting records.",
    "With this milestone financially cleared, our engineering team will proceed to the next phase of your project.",
    "Thank you for your prompt payment and continued trust in our services.",
    "Best regards\nIMHOGEN Finance Department",
  ].join("\n\n")
}

// The receipt's file name, such as IMHO_REC26_002_AcmeFoods.pdf for receipt
// IMHO-REC26-002 to Acme Foods.
export function receiptFileName(
  receiptNumber: string,
  clientName: string
): string {
  return numberedFileName(receiptNumber, clientName, "IMHO_REC")
}

// Where the receipt of one milestone cycle is read, shown in the page, or
// saved as a file with `download`.
export function receiptPath(
  projectId: string,
  cycle: number,
  download = false
): string {
  return `/api/projects/${projectId}/receipts/${cycle}${download ? "?download=1" : ""}`
}

// The page that shows the email one cycle's D3.9 sent, as it went out.
export function sentReceiptEmailPath(projectId: string, cycle: number) {
  return `/projects/${projectId}/tools/${PAYMENT_RECEIPT}/sent-email?cycle=${cycle}`
}
