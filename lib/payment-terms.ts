// D3.1, the payment terms extract, the first tool of Workbook 3: the Finance
// Officer copies the executed contract's payment schedule and money rules
// into the app, signs and submits, and the PM approves it, which locks it.

export const PAYMENT_TERMS = "D3.1"

export const yesNo = ["Yes", "No"]

// 2.0's starting milestones, each a description the FO can change.
export const paymentMilestones = [
  "Advance Payment (Contract Signing)",
  "Fabrication Milestone (Design Approval)",
  "Final Handover (System Delivery)",
]

// 3.0's fixed rule categories, each with the agreed term it starts on. The
// currency's term is built from D2.1's Default Currency (`currencyTerm`).
export const complianceRules = [
  {
    category: "Invoice Payment Window",
    term: "Net 21 Days from Invoice Issuance",
  },
  {
    category: "Late Payment Penalty",
    term: "2% Monthly Interest on outstanding balance",
  },
  {
    category: "Tax / VAT Obligations",
    term: "All prices are exclusive of 15% VAT",
  },
  { category: "Accepted Currency", term: "Ghana Cedis (GHS) ONLY" },
]

// The Accepted Currency term for D2.1's Default Currency, such as "Ghana
// Cedis (GHS) ONLY" for GHS.
export function currencyTerm(currency: string | undefined): string {
  const code = (currency ?? "").trim()

  return code === "" || code.toUpperCase() === "GHS"
    ? "Ghana Cedis (GHS) ONLY"
    : `${code} ONLY`
}
