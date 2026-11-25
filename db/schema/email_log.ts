import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { projects } from "./access"
import { toolRecords } from "./records"

export const emailStatuses = [
  "queued",
  "sent",
  "failed",
  "delivered",
  "bounced",
  "complained",
] as const

export type EmailStatus = (typeof emailStatuses)[number]

// The email as it went out, kept only for an email a tool shows again, such
// as D2.7's contract to the client. Attachments are named, not stored.
export type EmailCopy = {
  to: string
  cc: string[]
  subject: string
  text: string
  attachments: string[]
}

export const emailStatusEnum = pgEnum("email_status", emailStatuses)

// One row per email the app asks to send. The key is unique, so asking twice
// for the same email finds this row instead of sending again. The kind is
// text, not an enum, so a later kind needs only its template. The message ID
// stays empty until Resend accepts the email. The recipient lives here and
// never in application logs.
export const emailLog = pgTable("email_log", {
  id: uuid().primaryKey().defaultRandom(),
  recipient: text().notNull(),
  kind: text().notNull(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "restrict",
  }),
  recordId: uuid("record_id").references(() => toolRecords.id, {
    onDelete: "restrict",
  }),
  messageId: text("message_id"),
  status: emailStatusEnum().notNull().default("queued"),
  error: text(),
  key: text().notNull().unique(),
  // Set when the delivery check gave up on an email still at sent, after 72
  // hours with no answer. It is not checked again.
  unconfirmedAt: timestamp("unconfirmed_at", { withTimezone: true }),
  // Filled in once sent, only when the sender asked to keep a copy.
  copy: jsonb().$type<EmailCopy>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
