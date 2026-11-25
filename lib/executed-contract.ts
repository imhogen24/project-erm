// D2.12, the executed contract and audit trail: once both sides have signed
// D2.11, the Contract Admin files the signed contract and its signing log,
// confirms Finance has issued the advance invoice, and the PM approves it.

export const EXECUTED_CONTRACT = "D2.12"

export const APP_PLATFORM = "IMHOGEN App (Digital Signature)"

export const SCAN = "Physical Scan"

export const platforms = [APP_PLATFORM, SCAN]

export const yesNo = ["Yes", "No"]

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

// 3.0's tasks, each with who does it. The CA sets both, since the Finance
// Officer only reads D2.12.
export const financeTasks = [
  {
    task: "Has the executed contract been emailed to the Finance Department?",
    assignee: "Contract Admin",
  },
  {
    task: "Has Finance generated and issued the Advance Payment Invoice?",
    assignee: "Finance Officer",
  },
]
