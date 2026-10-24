import { sql } from "drizzle-orm"
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { people, projects, roleEnum } from "./access"

// An invite says: this person, with this email, gets these roles on this
// project, or on every project when there is no project. Only a hash of the
// token is stored, so a copy of the database cannot be used to accept an invite.
export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "restrict",
    }),
    roles: roleEnum().array().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A Client is always tied to their own project.
    check(
      "invitations_client_on_a_project",
      sql`${table.projectId} IS NOT NULL OR NOT ('Client' = ANY(${table.roles}))`
    ),
  ]
)
