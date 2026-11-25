// D2.5, the Head of R&D / Ops's review of the draft contract once the Finance
// Officer has approved it in D2.4: the last check before it reaches the
// client.

export const EXECUTIVE_REVIEW = "D2.5"

export const APPROVED_FOR_CLIENT = "Approved for Client Transmission"

export const REJECTED = "Rejected"

export const HOLD_FOR_REVISION = "Hold for Revision"

export const executiveDecisions = [
  APPROVED_FOR_CLIENT,
  REJECTED,
  HOLD_FOR_REVISION,
]

// What the sheet's Next Step Directive says for each decision.
export const executiveNextSteps = {
  [APPROVED_FOR_CLIENT]:
    "Proceed to D2.6 (Lock Draft) and D2.7 (Client Transmittal)",
  [REJECTED]: "Project Closed",
  [HOLD_FOR_REVISION]: "Return to Contract Admin for Edits",
}

export const verifiedOrMissing = ["Verified", "Missing"]

// The rows 2.0 and 3.0 start with. The executive can change each one, and
// add rows after them.
export const signOffCheckpoints = [
  "PM Operational Approval (D2.3) complete and attached?",
  "Finance Commercial Approval (D2.4) complete and attached?",
  "All requested edits from PM and Finance applied to current draft?",
]

export const macroRisks = [
  {
    category: "Technical & Scope Risk",
    question:
      "Are the engineering boundaries and exclusions tight enough to prevent scope creep?",
  },
  {
    category: "Operational Risk",
    question:
      "Does the timeline allow sufficient buffer for Kumasi supply chain delays?",
  },
  {
    category: "Commercial Risk",
    question:
      "Does the payment schedule protect IMHO GEN from out-of-pocket fabrication costs?",
  },
  {
    category: "Legal & IP Risk",
    question:
      "Are IMHO GEN's background IP and native CAD files adequately protected?",
  },
]
