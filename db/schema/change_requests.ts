import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects } from "./access"
import { toolRecords } from "./records"

export const changeRequestStatuses = [
  "requested",
  "approved",
  "rejected",
  "applied",
] as const

export type ChangeRequestStatus = (typeof changeRequestStatuses)[number]

export const changeRequestStatusEnum = pgEnum(
  "change_request_status",
  changeRequestStatuses
)

// One row per request to unlock a locked record. It is open while requested,
// and while approved until the record is locked again, when it is applied.
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => toolRecords.id, { onDelete: "restrict" }),
    reason: text().notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    status: changeRequestStatusEnum().notNull().default("requested"),
    decidedBy: uuid("decided_by").references(() => people.id, {
      onDelete: "restrict",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("change_requests_project_id_idx").on(table.projectId),
    // A record has at most one open request.
    uniqueIndex("change_requests_one_open_per_record")
      .on(table.recordId)
      .where(sql`${table.status} IN ('requested', 'approved')`),
  ]
)
