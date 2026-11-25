import { escapeHtml, type RenderedEmail } from "./html"

export type ContractTransmittalData = {
  subject: string
  // The script the Contract Admin prepared on D2.7, sent exactly as written.
  // Blank lines separate paragraphs.
  body: string
  // The draft contract's PDF, as base64.
  attachment: { filename: string; content: string }
}

// D2.7: the draft contract to the client, with its PDF attached. The wording
// is the record's own, so nothing here adds to it.
export function contractTransmittal(
  data: ContractTransmittalData
): RenderedEmail {
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
        filename: data.attachment.filename,
        content: data.attachment.content,
        contentType: "application/pdf",
        encoding: "base64",
      },
    ],
  }
}
