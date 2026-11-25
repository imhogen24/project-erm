// D2.9, the negotiation meeting notes: during and after the meeting D2.8 set
// up, the Contract Admin records each clause the client challenged and what
// was agreed, and the meeting's outcome decides where the contract goes next.

export const NEGOTIATION_NOTES = "D2.9"

export const TERMS_AGREED = "Terms Agreed - Proceed to D2.10"

export const DEADLOCK = "Deadlock - Escalate"

export const CLIENT_WITHDRAWN = "Client Withdrawn"

export const meetingOutcomes = [TERMS_AGREED, DEADLOCK, CLIENT_WITHDRAWN]
