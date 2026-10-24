import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects } from "./access"
import { toolRecords, type JsonValue } from "./records"

export const auditActions = ["created", "updated", "transitioned"] as const

export type AuditAction = (typeof auditActions)[number]

export const auditActionEnum = pgEnum("audit_action", auditActions)

// One line per changed field. A database rule refuses any UPDATE or DELETE on
// it, so a line can be added but never changed. An empty old or new value means
// the field did not exist before or after. A line about the project itself has
// no record, and a status change keeps its reason.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordId: uuid("record_id").references(() => toolRecords.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    action: auditActionEnum().notNull(),
    field: text().notNull(),
    oldValue: jsonb("old_value").$type<JsonValue>(),
    newValue: jsonb("new_value").$type<JsonValue>(),
    reason: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_record_id_idx").on(table.recordId),
    index("audit_log_project_id_idx").on(table.projectId),
  ]
)
