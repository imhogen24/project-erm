import { createHash } from "node:crypto"

import type { Database } from "@/db"
import { calendarFile } from "@/lib/calendar-agenda"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"

// What D1.6 and D2.8 share to send a meeting's calendar invite: which version
// of the invite goes, and the email that carries it with its calendar file.

// The email service did not take the invite.
export class InviteRefusedError extends Error {}

// A short fingerprint of what an invite says, written out as text, so the
// same invite sent twice is known to be the same.
export function inviteDigest(said: string): string {
  return createHash("sha256").update(said).digest("hex").slice(0, 16)
}

// The version of the invite to send: the one already reserved when it says
// the same, or the next one, which updates the same meeting in calendars.
export function inviteSequence(
  saved: { inviteSequence?: number; inviteDigest?: string },
  digest: string
): number {
  return saved.inviteDigest === digest && saved.inviteSequence !== undefined
    ? saved.inviteSequence
    : (saved.inviteSequence ?? -1) + 1
}

// "IMHOGEN <noreply@imhogen.com>" is sent as "noreply@imhogen.com".
export function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim()
}

export type InviteEmail = {
  projectId: string
  recordId: string
  // Each version goes once: the email's key is the record and the version.
  keyPrefix: string
  sequence: number
  start: Date
  minutes: number
  summary: string
  description: string
  location: string
  link?: string
  // Everyone the calendar file invites: the first gets the email, the
  // others a copy.
  attendees: { name: string; email: string }[]
  subject: string
  body: string
  now: Date
  transport?: Transport
}

// Emails the invite with its calendar file. The calendar file's UID is the
// record's, so every version of it is the same meeting. Refused, or still
// being sent by another press, it throws InviteRefusedError and nothing
// counts as sent.
export async function emailInvite(
  database: Database,
  input: InviteEmail
): Promise<void> {
  const [main, ...others] = input.attendees

  if (!main) {
    throw new InviteRefusedError("The invite has nobody to go to.")
  }

  const ics = calendarFile({
    uid: `${input.recordId}@erm.imhogen`,
    sequence: input.sequence,
    start: input.start,
    minutes: input.minutes,
    summary: input.summary,
    description: input.description,
    location: input.location,
    link: input.link,
    organizer: addressOf(requireEnv("EMAIL_FROM")),
    attendees: input.attendees,
    now: input.now,
  })

  const sent = await sendEmail(
    database,
    {
      to: main.email,
      cc: others.map((each) => each.email),
      kind: "calendar_invite",
      data: { subject: input.subject, body: input.body, ics },
      projectId: input.projectId,
      recordId: input.recordId,
      key: `${input.keyPrefix}:${input.recordId}:${input.sequence}`,
    },
    input.transport ?? getTransport()
  )

  if (sent.status === "failed") {
    throw new InviteRefusedError(
      `The invite did not go: ${sent.error ?? "no reason given"}. Press Send calendar invite to try again.`
    )
  }

  if (sent.status === "queued") {
    throw new InviteRefusedError(
      "This invite is already being sent. Reload the page in a moment."
    )
  }
}
