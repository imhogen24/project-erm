import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
