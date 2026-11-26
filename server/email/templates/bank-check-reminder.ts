import { layout, placeholder, type RenderedEmail } from "./html"

export type BankCheckReminderData = {
  projectName: string
  // The milestone the payment is for, such as "2.2 Fabrication Milestone
  // (Design Approval)".
  milestone: string
  link: string
}

// Reminds the Finance Officer, each working morning, to check the bank for
// a milestone payment while that milestone's D3.7 check is open.
export function bankCheckReminder(data: BankCheckReminderData): RenderedEmail {
  const lines = [
    `${placeholder}: check the bank today for the client's payment, and log it in D3.7.`,
    `Project: ${data.projectName}`,
    `Milestone: ${data.milestone}`,
  ]

  return {
    subject: `[${placeholder}] Check the bank for ${data.projectName}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
