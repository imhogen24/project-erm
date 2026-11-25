import { escapeHtml, placeholder, type RenderedEmail } from "./html"

export type SignatureReminderData = {
  // The subject of the email it follows up.
  subject: string
  clientName: string
  link: string
}

// D2.11's reminder to a client who has not signed the final contract yet,
// sent every three days when the Contract Admin asked for it. The wording is
// not written yet.
export function signatureReminder(data: SignatureReminderData): RenderedEmail {
  const lines = [
    `Dear ${data.clientName}`,
    `${placeholder}: a reminder that the final agreement is waiting for your signature.`,
    `Sign it here: ${data.link}`,
    "Best regards",
  ]

  return {
    subject: `Re: ${data.subject}`,
    text: lines.join("\n\n"),
    html: `<!doctype html><html><body>${lines
      .map((line) =>
        line.startsWith("Sign it here: ")
          ? `<p>Sign it here: <a href="${escapeHtml(data.link)}">${escapeHtml(data.link)}</a></p>`
          : `<p>${escapeHtml(line)}</p>`
      )
      .join("")}</body></html>`,
  }
}
