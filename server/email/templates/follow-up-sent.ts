import { layout, placeholder, type RenderedEmail } from "./html"

export type FollowUpSentData = {
  projectName: string
  link: string
}

// Tells the Contract Admin that the client was reminded about a draft
// contract they have not answered.
export function followUpSent(data: FollowUpSentData): RenderedEmail {
  const lines = [
    `${placeholder}: the client has not answered the draft contract, so they were sent a reminder.`,
    `Project: ${data.projectName}`,
  ]

  return {
    subject: `[${placeholder}] Contract reminder sent: ${data.projectName}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
