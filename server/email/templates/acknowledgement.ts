import { escapeHtml, type RenderedEmail } from "./html"

export type AcknowledgementData = {
  subject: string
  // The text the OM prepared on D1.4, sent exactly as written. Blank lines
  // separate paragraphs.
  body: string
}

// D1.4: the client's acknowledgement. Unlike the other kinds, the wording is
// the record's own, so nothing here adds to it.
export function acknowledgement(data: AcknowledgementData): RenderedEmail {
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
  }
}
