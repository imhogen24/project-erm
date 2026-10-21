import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// The 19 roles.
export const roles = [
  "Client",
  "OM",
  "PM",
  "LE",
  "AE",
  "LD",
  "FO",
  "CA",
  "HE",
  "PO",
  "IO",
  "WS",
  "T",
  "QA",
  "LFE",
  "LO",
  "CR",
  "IT/Admin",
  "MKT",
] as const

export type Role = (typeof roles)[number]

export const roleEnum = pgEnum("role", roles)

export const people = pgTable("people", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// A person can hold several roles on a project
export const personProjectRoles = pgTable(
  "person_project_roles",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: roleEnum().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.projectId, table.role] }),
    index("person_project_roles_project_id_idx").on(table.projectId),
  ]
)
