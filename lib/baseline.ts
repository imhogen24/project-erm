// D2.6, the internally approved draft: the baseline and walk-away limits the
// Contract Admin freezes once the Head of R&D / Ops approves the draft in
// D2.5, before anything reaches the client. Negotiation reads its limits.

export const BASELINE = "D2.6"

export const yesNo = ["Yes", "No"]

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

// 2.0's rows, as the sheet names them. A baseline the draft holds starts from
// it (server/contract/baseline); the others start empty with the sheet's
// example as a hint, and so does every limit.
export const contractVariables = [
  {
    variable: "Total Contract Value (GHS)",
    baselineHint: "e.g. 173",
    limitHint: "",
  },
  {
    variable: "Advance Payment %",
    baselineHint: "e.g. 40%",
    limitHint: "e.g. Absolute minimum 35% to cover initial BOM",
  },
  {
    variable: "Total Project Timeline",
    baselineHint: "e.g. 40 Working Days",
    limitHint: "e.g. Cannot compress below 35 Days due to workshop load",
  },
  {
    variable: "Warranty / Support SLA",
    baselineHint: "e.g. 30 Days Post-Delivery",
    limitHint: "e.g. Maximum 60 Days; no extended warranties without fee",
  },
]

// 3.0's tasks, each the Contract Admin's.
export const CONTRACT_ADMIN = "Contract Admin"

export const archiveTasks = [
  "Has the D2.2 Google Doc been exported as a static, non-editable PDF?",
  "Is the locked PDF named according to standard convention (e.g. IMHO_Contract_V1_ClientName)?",
  "Is the locked PDF saved in the permanent client folder?",
]
