// D2.4, the Finance Officer's review of the draft contract once the PM has
// approved it in D2.3.

import { APPROVED, REVISIONS_REQUIRED } from "@/lib/pm-review"

export const FINANCE_REVIEW = "D2.4"

// What the sheet's Next Step Directive says for each status.
export const financeNextSteps = {
  [APPROVED]: "Proceed to Executive Review (D2.5)",
  [REVISIONS_REQUIRED]: "Return to Contract Admin for Edits",
}

// D1.14's answer to whether the minimum overhead is met, shown read only in
// row 2.2 of 2.0 each time D2.4 is shown, so it is always D1.14's own.
export const OVERHEAD_MET = "D1.14 Minimum Overhead Met"

// The rows 2.0 to 4.0 start with. The FO can change each one, and add rows
// after them.
export const financialElements = [
  "Total Contract Value (GHS) matches D1.15?",
  "Minimum institutional overhead is recovered?",
  "Currency and Tax (e.g. VAT/WHT) clearly stated?",
]

export const paymentMilestones = [
  "Advance Payment (e.g. 40% to cover design/initial BOM)",
  "Fabrication Milestone (e.g. 40% before ordering parts)",
  "Final Handover (e.g. 20% margin realization)",
  "Invoice payment terms (e.g. Net 21 Days) stated?",
]

export const riskProtections = [
  "Quote Validity Period (e.g. 21 days due to material pricing)",
  "Late Payment Penalties (e.g. 2% monthly interest)",
  "Termination Liability (Client pays for hours/BOM if cancelled)",
]

// D1.14 stores whether the minimum overhead is met as true or false; row 2.2
// reads it as the sheet does. A D1.14 that holds neither reads as empty.
export function overheadMetText(value: boolean | undefined): string {
  if (value === true) {
    return "Yes"
  }

  return value === false ? "No" : "—"
}
