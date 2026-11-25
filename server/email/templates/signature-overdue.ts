import { layout, placeholder, type RenderedEmail } from "./html"

export type SignatureOverdueData = {
  projectName: string
  link: string
}

// Tells the Contract Admin and the PM that a contract sent for signature is
// still not fully signed seven days on.
export function signatureOverdue(data: SignatureOverdueData): RenderedEmail {
  const lines = [
    `${placeholder}: the final contract has been waiting for signature for more than 7 days.`,
    `Project: ${data.projectName}`,
  ]

  return {
    subject: `[${placeholder}] Contract unsigned for 7 days: ${data.projectName}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
