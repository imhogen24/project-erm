import { sql } from "drizzle-orm"
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { notSystemPerson, people, projects } from "./access"
import { toolRecords } from "./records"

export const notificationKinds = [
  "new_request",
  "assigned",
  "approval_needed",
  "tool_open",
  "change_waiting",
  "change_decided",
  "email_bounced",
  "client_slots_ready",
  "client_brief_ready",
  "client_responded",
  "intake_failed",
  "email_unconfirmed",
  // An approver sent a submitted record back to its writer.
  "sent_back",
] as const

export type NotificationKind = (typeof notificationKinds)[number]

export const notificationKindEnum = pgEnum(
  "notification_kind",
  notificationKinds
)

// One row per person per dashboard notification. A database rule refuses any
// DELETE, and an UPDATE may only set an empty read_at, so a notification is
// never removed, only marked read. The path is inside the app, for example
// "/projects/<id>/tools/D1.2". The system person never receives one.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    kind: notificationKindEnum().notNull(),
    title: text().notNull(),
    text: text(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    recordId: uuid("record_id").references(() => toolRecords.id, {
      onDelete: "restrict",
    }),
    path: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_person_id_created_at_idx").on(
      table.personId,
      table.createdAt.desc()
    ),
    check("notifications_not_system", notSystemPerson(table.personId)),
    check(
      "notifications_path_in_app",
      sql`${table.path} LIKE '/%' AND ${table.path} NOT LIKE '//%'`
    ),
  ]
)
