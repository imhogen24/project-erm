// D2.7, the client transmitted record: the Contract Admin emails the draft
// contract to the client, the app can remind the client after three days,
// and the CA records how the client first replied.

export const TRANSMITTAL = "D2.7"

export const yesNo = ["Yes", "No"]

export const PENDING = "Pending"

export const ACCEPTED_AS_IS = "Accepted as-is"

export const REQUESTED_NEGOTIATION = "Requested Negotiation"

export const clientResponses = [PENDING, ACCEPTED_AS_IS, REQUESTED_NEGOTIATION]

// The reminder goes this long after sending, while the client has not
// answered.
export const FOLLOW_UP_DAYS = 3

// Quote Expiry Date starts this many days after D2.7 is first opened.
export const QUOTE_DAYS = 30

// The sheet's subject line, fixed, with the project's name filled in.
export function subjectFor(projectName: string) {
  return `IMHO GEN Engineering Services Agreement - ${projectName}`
}

// The sheet's script, kept exactly as written, including the sentence it cuts
// short: the CA finishes it before sending. `[Client Name]` and
// `[Project Name]` are filled in.
export function scriptFor(clientName: string, projectName: string) {
  return [
    `Dear ${clientName}`,
    `Following our discussions and the approved Project Brief, please find attached the Draft Engineering Services Agreement for ${projectName}.`,
    "This document outlines the formal technical scope, and payment schedules we have agreed upon. We encourage you and your legal team to review the terms carefully. Due to current fluctuations in material supply chains\nIf the terms meet your expectations,we are happy to schedule a brief alignment meeting.",
    "We look forward to officially kicking off this phase of engineering.",
    "Best regards",
  ].join("\n\n")
}

// The page that shows the email as it went out.
export function sentEmailPath(projectId: string, toolId: string) {
  return `/projects/${projectId}/tools/${toolId}/sent-email`
}
