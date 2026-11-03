import { layout, placeholder, type RenderedEmail } from "./html"

export type NewRequestData = {
  requestId: string
  link: string
}

// Sent to IT/Admin when a website request comes in.
export function newRequest(data: NewRequestData): RenderedEmail {
  const lines = [
    `${placeholder}: a new request has come in.`,
    `Request: ${data.requestId}`,
  ]

  return {
    subject: `[${placeholder}] New request ${data.requestId}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
