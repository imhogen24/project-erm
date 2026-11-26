import { layout, placeholder, type RenderedEmail } from "./html"

export type LockAnnouncedData = {
  recordTitle: string
  message: string
  link: string
}

// Sent to the roles a tool names once its record locks, such as the PM, FO
// and HE when D3.10 says the next phase may start.
export function lockAnnounced(data: LockAnnouncedData): RenderedEmail {
  const lines = [
    `${placeholder}: ${data.message}.`,
    `Approved: ${data.recordTitle}`,
  ]

  return {
    subject: `[${placeholder}] Approved: ${data.recordTitle}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
