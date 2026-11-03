export type RenderedEmail = {
  subject: string
  text: string
  html: string
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
export function layout(lines: string[], link: string) {
  const paragraphs = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")

  return `<!doctype html><html><body>${paragraphs}<p><a href="${escapeHtml(link)}">Open in the ERM</a></p></body></html>`
}
