import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects } from "./access"

// One row per workbook rollback. The PM who did it is the approver.
export const workbookRollbacks = pgTable(
  "workbook_rollbacks",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    fromWorkbook: integer("from_workbook").notNull(),
    toWorkbook: integer("to_workbook").notNull(),
    reason: text().notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("workbook_rollbacks_project_id_idx").on(table.projectId)]
)
