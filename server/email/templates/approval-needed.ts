import { layout, placeholder, type RenderedEmail } from "./html"

export type ApprovalNeededData = {
  recordTitle: string
  link: string
}

// Sent to an approver when a record is submitted for their approval.
export function approvalNeeded(data: ApprovalNeededData): RenderedEmail {
  const lines = [
    `${placeholder}: a record is waiting for your approval.`,
    `Record: ${data.recordTitle}`,
  ]

  return {
    subject: `[${placeholder}] Approval needed: ${data.recordTitle}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
