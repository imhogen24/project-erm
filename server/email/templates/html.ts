export type RenderedEmail = {
  subject: string
  text: string
  html: string
  // Files sent with it, such as a calendar invite (.ics).
  attachments?: { filename: string; content: string; contentType: string }[]
}

// Marks wording that is not final. The real wording is RDP-142.
export const placeholder = "PLACEHOLDER"

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

// Every template shares this shell, so a kind writes only its own lines.
export function layout(
  lines: string[],
  link: string,
  linkText = "Open in the ERM"
) {
  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")

  return `<!doctype html><html><body>${paragraphs}<p><a href="${escapeHtml(link)}">${escapeHtml(linkText)}</a></p></body></html>`
}
