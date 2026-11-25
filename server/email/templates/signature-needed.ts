import { layout, placeholder, type RenderedEmail } from "./html"

export type SignatureNeededData = {
  recordTitle: string
  signature: string
  link: string
}

// Sent to whoever signs a record once it is started, such as the FO on a
// negotiated D2.10.
export function signatureNeeded(data: SignatureNeededData): RenderedEmail {
  const lines = [
    `${placeholder}: a record is waiting for your signature.`,
    `Record: ${data.recordTitle}`,
    `Sign: ${data.signature}`,
  ]

  return {
    subject: `[${placeholder}] Signature needed: ${data.recordTitle}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
