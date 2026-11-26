import { layout, placeholder, type RenderedEmail } from "./html"

export type PaymentOverdueData = {
  projectName: string
  // The milestone the payment is for, such as "2.2 Fabrication Milestone
  // (Design Approval)".
  milestone: string
  dueDate: string
  link: string
}

// Tells the Finance Officer and the PM that a milestone payment is late and
// the app has opened its D3.11 overdue accounts report.
export function paymentOverdue(data: PaymentOverdueData): RenderedEmail {
  const lines = [
    `${placeholder}: the client's payment for this milestone was due on ${data.dueDate} and is not reconciled yet. Log each follow-up in D3.11.`,
    `Project: ${data.projectName}`,
    `Milestone: ${data.milestone}`,
  ]

  return {
    subject: `[${placeholder}] Payment overdue on ${data.projectName}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
