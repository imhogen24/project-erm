import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { projects } from "./access"

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
// which fields the payload holds.
export const toolRecords = pgTable(
  "tool_records",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    toolId: text("tool_id").notNull(),
    state: recordStateEnum().notNull().default("draft"),
    payload: jsonb().$type<JsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tool_records_project_id_tool_id_idx").on(
      table.projectId,
      table.toolId
    ),
  ]
)
