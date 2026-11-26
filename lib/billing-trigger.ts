// D3.3, the milestone billing trigger: once a payment milestone is done, the
// PM picks it from D3.1's schedule, uploads the client's sign-off, confirms
// the client accepted it with no disputes, signs and submits, and the
// Finance Officer approves billing it (Proceed to D3.4) or sends it back.
// Each milestone gets its own D3.3, one per payment milestone cycle.

export const BILLING_TRIGGER = "D3.3"

export const yesNo = ["Yes", "No"]

export const PROCEED = "Proceed to D3.4 Draft Invoice"

export const REJECTED = "Rejected back to PM"

export const actions = [PROCEED, REJECTED]
