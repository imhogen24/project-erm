// D2.11, the pending signature contract: the Contract Admin sends the final
// contract, the client signs it in the app, then the Head of Engineering
// signs for IMHOGEN, which locks it. A contract signed on paper is recorded
// by hand.

export const SIGNATURE_CONTRACT = "D2.11"

export const DIGITAL = "Digital Signature"

export const COURIER = "Physical Courier"

export const routingMethods = [DIGITAL, COURIER]

export const yesNo = ["Yes", "No"]

export const PENDING = "Pending"

export const SIGNED = "Signed"

export const signatureStatuses = [PENDING, SIGNED]

export const CLIENT_ROLE = "Client Representative"

export const IMHOGEN_ROLE = "IMHOGEN Representative"

// The client is reminded this often until they sign, when the CA asks for it.
export const REMINDER_DAYS = 3

// A contract still not fully signed this long after it was sent is flagged
// to the CA and the PM.
export const OVERDUE_DAYS = 7

const DIGITAL_LINE =
  "You can click the link below to review and sign the document digitally."

// The sheet's script with `[Client Name]` and `[Your Name]` filled in. The
// DocuSign bracket is the digital-signing sentence for Digital Signature and
// is left out for Physical Courier.
export function signatureScriptFor(
  clientName: string,
  yourName: string,
  method: string
) {
  const attached =
    "Please find the finalized contract attached for your signature."

  return [
    `Dear ${clientName}`,
    "Thank you for a highly productive alignment meeting. We have updated the Engineering Services Agreement to reflect the exact terms we agreed upon.",
    method === DIGITAL ? `${attached} ${DIGITAL_LINE}` : attached,
    "Once executed by both parties,our Finance team will issue the invoice for the advance payment,and our Engineering team will formally initiate Phase 1.",
    "We are excited to begin this development journey with you.",
    `Best regards\n${yourName} | IMHOGEN LTD`,
  ].join("\n\n")
}

// The subject of the email that sends the final contract.
export function signatureSubjectFor(projectName: string) {
  return `IMHO GEN Engineering Services Agreement - ${projectName} - for signature`
}

// Where the client signs: D2.11 itself, in the app.
export function signingPath(projectId: string) {
  return `/projects/${projectId}/tools/${SIGNATURE_CONTRACT}`
}
