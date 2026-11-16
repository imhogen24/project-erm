import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects, roleEnum } from "./access"
import { toolRecords } from "./records"

// The team's comments on a tool's record, and the replies to them. A comment
// has no parent; a reply points at the comment it answers. The role is the
// one the author spoke as when they wrote it, so it stays the same if their
// roles change later. Resolving marks the comment, and with it its replies,
// as done; nothing is ever deleted. A reply goes when its comment goes, which
// only test clean-up does.
export const recordComments = pgTable(
  "record_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => toolRecords.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => recordComments.id,
      { onDelete: "cascade" }
    ),
    authorId: uuid("author_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    authorRole: roleEnum("author_role").notNull(),
    body: text().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => people.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("record_comments_record_id_idx").on(table.recordId),
    index("record_comments_parent_id_idx").on(table.parentId),
  ]
)
