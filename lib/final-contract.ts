// D2.10, the finalized contract: once terms are agreed, the Contract Admin
// writes every concession into the contract, records the exact wording that
// changed, and locks the final contract for signature routing (D2.11).

export const FINAL_CONTRACT = "D2.10"

export const PENDING = "Pending"

export const UPDATED = "Updated"

export const amendmentStatuses = [PENDING, UPDATED]

// 4.0's tasks, each the Contract Admin's.
export const finalTasks = [
  "Has the D2.10 Google Doc been exported as the FINAL static PDF?",
  "Is the locked PDF named according to standard convention (e.g. IMHO_FinalContract_ClientName)?",
]
