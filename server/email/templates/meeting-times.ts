import { escapeHtml, type RenderedEmail } from "./html"

export type MeetingTimesData = {
  subject: string
  // The scheduling email from D1.5, with the proposed times listed. Blank
  // lines separate paragraphs.
  body: string
  // Where the client chooses: D1.5 on their dashboard.
  link: string
}

// D1.5: the times proposed for the discovery meeting. The client answers on
// their dashboard, never by replying, so the email ends with the link.
export function meetingTimes(data: MeetingTimesData): RenderedEmail {
  const paragraphs = data.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`
    )
    .join("")

  const link = escapeHtml(data.link)

  return {
    subject: data.subject,
    text: `${data.body}\n\nChoose a time: ${data.link}`,
    html: `<!doctype html><html><body>${paragraphs}<p><a href="${link}">Choose a time</a></p></body></html>`,
  }
}
