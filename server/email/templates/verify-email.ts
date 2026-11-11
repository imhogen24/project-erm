import { layout, type RenderedEmail } from "./html"

export type VerifyEmailData = {
  name: string
  link: string
}

// Sent to a client who signed up, and again each time they try to sign in
// before confirming. The link confirms the email and signs them in.
export function verifyEmail(data: VerifyEmailData): RenderedEmail {
  const lines = [
    `Hello ${data.name},`,
    "Confirm your email to finish making your IMHOGEN account.",
    "If you did not sign up, ignore this email.",
  ]

  return {
    subject: "Confirm your email",
    text: [...lines, `Confirm it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link, "Confirm your email"),
  }
}
