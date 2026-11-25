import { escapeHtml, placeholder, type RenderedEmail } from "./html"

export type TransmittalFollowUpData = {
  // The subject of the email it follows up.
  subject: string
  clientName: string
}

// D2.7's reminder to a client who has not answered the draft contract three
// days after it was sent. The wording is not written yet.
export function transmittalFollowUp(
  data: TransmittalFollowUpData
): RenderedEmail {
  const lines = [
    `Dear ${data.clientName}`,
    `${placeholder}: a reminder about the draft agreement we sent you. Please let us know if you have any questions.`,
    "Best regards",
  ]

  return {
    subject: `Re: ${data.subject}`,
    text: lines.join("\n\n"),
    html: `<!doctype html><html><body>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</body></html>`,
  }
}
