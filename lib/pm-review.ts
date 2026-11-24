// D2.3, the PM's review of the initial draft contract: D2.2 on Tier 1,
// T3.D2.2a on Tier 3.

export const PM_REVIEW = "D2.3"

// The draft the PM reviews, named as on Tier 1. On a Tier 3 project it is the
// tool that takes its place, T3.D2.2a.
export const REVIEWED_DRAFT = "D2.2"

export const accurateOrMismatch = ["Accurate", "Mismatch"]

export const yesNo = ["Yes", "No"]

export const APPROVED = "Approved"

export const REVISIONS_REQUIRED = "Revisions Required"

export const verificationStatuses = [APPROVED, REVISIONS_REQUIRED]

// What the sign-off's Next Step Directive says for each status.
export const nextSteps = {
  [APPROVED]: "Proceed to Finance Review (D2.4)",
  [REVISIONS_REQUIRED]: "Return to Contract Admin for Edits",
}

// The rows 2.0 and 3.0 start with. The PM can change each one, and add rows.
export const deliverableCategories = [
  "Engineering Design",
  "Physical Fabrication",
  "Technical Documentation",
  "Excluded Scope / Boundary Limits",
]

export const projectMilestones = [
  "Phase 1 (Concept & Design)",
  "Phase 2 (Procurement & Fab)",
  "Phase 3 (Testing & Handover)",
  "Overall Delivery Date",
]

// D1.15's client dependencies are one long text, a dependency to a line. 4.0
// starts with a row for each line that holds one, or one empty row when none
// does.
export function dependencyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
}
