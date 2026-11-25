import { layout, placeholder, type RenderedEmail } from "./html"

export type SentBackData = {
  recordTitle: string
  reason: string
  link: string
}

// Sent to the roles a review names when it sends work back, such as the HE
// and PM when the negotiation deadlocks and D2.8 opens again.
export function sentBack(data: SentBackData): RenderedEmail {
  const lines = [
    `${placeholder}: ${data.reason}.`,
    `Open again: ${data.recordTitle}`,
  ]

  return {
    subject: `[${placeholder}] Open again: ${data.recordTitle}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
