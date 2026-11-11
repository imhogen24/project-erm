import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"
import { Resend } from "resend"
import { z } from "zod"

import type { Database } from "@/db"
import { emailLog } from "@/db/schema"
import { requireEnv } from "@/server/database"

import { renderEmail, type EmailDataByKind, type EmailKind } from "./templates"

export type EmailMessage = {
  from: string
  to: string
  // Copied openly. Left out when there are none.
  cc?: string[]
  subject: string
  text: string
  html: string
}

// The idempotency key is the email's own key, so a provider that accepted an
// email we then marked failed drops the retry instead of sending it twice.
export type Transport = {
  name: string
  send: (
    message: EmailMessage,
    options: { idempotencyKey: string }
  ) => Promise<{ id: string }>
}

export type FakeTransport = Transport & { sent: EmailMessage[] }

export type EmailInput<K extends EmailKind> = {
  to: string
  cc?: string[]
  kind: K
  data: EmailDataByKind[K]
  projectId?: string
  recordId?: string
  key: string
}

export type EmailLogRow = typeof emailLog.$inferSelect

const recipient = z.email()

// Records what would have been sent, and sends nothing.
export function createFakeTransport(): FakeTransport {
  const sent: EmailMessage[] = []

  return {
    name: "fake",
    sent,
    send: async (message) => {
      sent.push(message)

      return { id: `fake-${randomUUID()}` }
    },
  }
}

function createResendTransport(apiKey: string): Transport {
  const resend = new Resend(apiKey)

  return {
    name: "resend",
    send: async (message, options) => {
      const { data, error } = await resend.emails.send(message, options)

      if (error || !data) {
        throw new Error(error?.message ?? "Resend returned no message ID")
      }

      return { id: data.id }
    },
  }
}

// Local development and tests have no Resend key, so they share one fake and
// never send a real email.
const localTransport = createFakeTransport()

// Production with no key is a setup mistake. Every send fails, so the rows
// show it and can be sent again once the key is set.
const missingKeyTransport: Transport = {
  name: "missing-key",
  send: async () => {
    throw new Error("RESEND_API_KEY is not set")
  },
}

export function getTransport(): Transport {
  const apiKey = process.env.RESEND_API_KEY

  if (apiKey) {
    return createResendTransport(apiKey)
  }

  return process.env.VERCEL_ENV === "production"
    ? missingKeyTransport
    : localTransport
}

// The key makes a retry safe: a key already sent returns its row and sends
// nothing, and a key that failed is sent again on the same row. A failure to
// send never throws, so the action that asked for the email still succeeds.
// Only a bad address is refused, before anything is written.
export async function sendEmail<K extends EmailKind>(
  database: Database,
  input: EmailInput<K>,
  transport: Transport = getTransport()
): Promise<EmailLogRow> {
  const to = recipient.parse(input.to)
  const cc = (input.cc ?? []).map((address) => recipient.parse(address))

  const [created] = await database
    .insert(emailLog)
    .values({
      recipient: to,
      kind: input.kind,
      projectId: input.projectId,
      recordId: input.recordId,
      key: input.key,
    })
    .onConflictDoNothing({ target: emailLog.key })
    .returning()

  const row = created ?? (await claimFailed(database, input.key))

  if (!row) {
    const [existing] = await database
      .select()
      .from(emailLog)
      .where(eq(emailLog.key, input.key))

    return existing
  }

  try {
    const email = renderEmail(input.kind, input.data)

    const { id } = await transport.send(
      {
        from: requireEnv("EMAIL_FROM"),
        to,
        ...(cc.length > 0 && { cc }),
        ...email,
      },
      { idempotencyKey: input.key }
    )

    return await finish(database, row.id, {
      status: "sent",
      messageId: id,
      error: null,
    })
  } catch (error) {
    return await finish(database, row.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// What became of a sent email, as the delivery check reads it. Sent means no
// final answer yet.
export type Delivery = "sent" | "delivered" | "bounced" | "complained"

export type DeliveryLookup = {
  name: string
  status: (messageId: string) => Promise<Delivery>
}

// Resend gives the last thing that happened to an email. Opened and clicked
// come after delivery. An email that could not reach the address counts as a
// bounce, so the PM can correct it.
export function deliveryOf(lastEvent: string): Delivery {
  switch (lastEvent) {
    case "delivered":
    case "opened":
    case "clicked":
      return "delivered"
    case "bounced":
    case "suppressed":
    case "failed":
    case "canceled":
      return "bounced"
    case "complained":
      return "complained"
    default:
      return "sent"
  }
}

function createResendLookup(apiKey: string): DeliveryLookup {
  const resend = new Resend(apiKey)

  return {
    name: "resend",
    status: async (messageId) => {
      const { data, error } = await resend.emails.get(messageId)

      if (error || !data) {
        throw new Error(error?.message ?? "Resend returned no email")
      }

      return deliveryOf(data.last_event)
    },
  }
}

// Local development sends nothing, so every email counts as delivered and the
// tools after it open.
const localLookup: DeliveryLookup = {
  name: "fake",
  status: async () => "delivered",
}

// Production with no key has no answer, so its emails stay at sent.
const missingKeyLookup: DeliveryLookup = {
  name: "missing-key",
  status: async () => {
    throw new Error("RESEND_API_KEY is not set")
  },
}

export function getLookup(): DeliveryLookup {
  const apiKey = process.env.RESEND_API_KEY

  if (apiKey) {
    return createResendLookup(apiKey)
  }

  return process.env.VERCEL_ENV === "production"
    ? missingKeyLookup
    : localLookup
}

// Moves a failed row back to queued, so only one retry sends it.
async function claimFailed(database: Database, key: string) {
  const [row] = await database
    .update(emailLog)
    .set({ status: "queued", error: null, updatedAt: new Date() })
    .where(and(eq(emailLog.key, key), eq(emailLog.status, "failed")))
    .returning()

  return row
}

async function finish(
  database: Database,
  id: string,
  values: Pick<Partial<EmailLogRow>, "status" | "messageId" | "error">
) {
  const [row] = await database
    .update(emailLog)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(emailLog.id, id))
    .returning()

  return row
}
