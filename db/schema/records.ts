import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects } from "./access"

export const recordStates = [
  "draft",
  "submitted",
  "approved",
  "locked",
  "void",
] as const

export type RecordState = (typeof recordStates)[number]

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export const recordStateEnum = pgEnum("record_state", recordStates)

// One row per tool record (D1.1, D1.8, ...). The tool's definition decides
// which fields the payload holds. A tool that repeats once per payment
// milestone has one record per cycle; every other tool is always cycle 1. The
// unique index allows one record that is not void per tool and cycle, so two
// simultaneous creates cannot both succeed. Who submitted and who approved,
// and when, are kept on the record; the audit log keeps every move.
export const toolRecords = pgTable(
  "tool_records",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    toolId: text("tool_id").notNull(),
    cycle: integer().notNull().default(1),
    state: recordStateEnum().notNull().default("draft"),
    payload: jsonb().$type<JsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedBy: uuid("submitted_by").references(() => people.id, {
      onDelete: "restrict",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => people.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (table) => [
    index("tool_records_project_id_tool_id_idx").on(
      table.projectId,
      table.toolId
    ),
    uniqueIndex("tool_records_one_live_per_cycle")
      .on(table.projectId, table.toolId, table.cycle)
      .where(sql`${table.state} <> 'void'`),
    check("tool_records_cycle_positive", sql`${table.cycle} >= 1`),
  ]
)
