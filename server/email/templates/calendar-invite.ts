import { escapeHtml, type RenderedEmail } from "./html"

export type CalendarInviteData = {
  subject: string
  // The meeting, where it is, who attends and the agenda. Blank lines
  // separate paragraphs.
  body: string
  // The calendar file (.ics) that calendars add as a meeting request.
  ics: string
}

// D1.6: the discovery meeting's calendar invite, with the file attached.
export function calendarInvite(data: CalendarInviteData): RenderedEmail {
  const paragraphs = data.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`
    )
    .join("")

  return {
    subject: data.subject,
    text: data.body,
    html: `<!doctype html><html><body>${paragraphs}</body></html>`,
    attachments: [
      {
        filename: "invite.ics",
        content: data.ics,
        contentType: "text/calendar; method=REQUEST; charset=UTF-8",
      },
    ],
  }
}
