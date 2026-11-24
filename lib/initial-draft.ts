// D2.2, the initial draft contract: the project's own figures, mapped into the
// contract D2.1 holds the clauses of.

export const INITIAL_DRAFT = "D2.2"

export const yesNo = ["Yes", "No"]

export const attachmentStatuses = ["Attached", "Missing"]

// 2.0's variables, as the sheet names them, each with the tool it comes from.
export const coreVariables = [
  { variable: "Client Legal Entity Name", source: "D1.3" },
  { variable: "Primary Client Signatory", source: "D1.15" },
  { variable: "Total Contract Value (GHS)", source: "D1.15" },
  { variable: "Project Duration / Timeline", source: "D1.15" },
]

// 3.0 to 5.0 start with one row for each of D1.15's first three budget lines
// or phases.
export const startingRows = 3

export const paymentSchedules = Array.from(
  { length: startingRows },
  (_, index) => `Payment Schedule ${index + 1}`
)

export const phases = Array.from(
  { length: startingRows },
  (_, index) => `Phase ${index + 1}`
)

// The [bracketed] name 5.0's fixed row fills with a D1.15 phase's key
// deliverables, such as "Phase 1 Key Deliverables".
export function deliverablesName(phase: string) {
  return `${phase} Key Deliverables`
}

export const legalDirectives = [
  "Scope Exclusion",
  "Timeline Risk",
  "Financial Risk",
]

// 7.0's attachments, with the sheet's notes, which are shown only as hints.
export const appendices = [
  {
    attachment: "Appendix A: D1.15 Project Brief & Draft Budget",
    note: "Governs technical scope",
  },
  {
    attachment: "Appendix B: D1.13 Scope of Work (Exclusions)",
    note: "Governs boundary limits",
  },
  {
    attachment: "Appendix C: IMHO GEN Standard SLA",
    note: "Governs post-delivery support",
  },
]
