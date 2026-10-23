import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { people, projects, roleEnum } from "./access"

export const accessActions = [
  "invited",
  "roles_added",
  "invite_accepted",
] as const

export type AccessAction = (typeof accessActions)[number]

export const accessActionEnum = pgEnum("access_action", accessActions)

export const accessLog = pgTable("access_log", {
  id: uuid().primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  action: accessActionEnum().notNull(),
  personId: uuid("person_id").references(() => people.id, {
    onDelete: "restrict",
  }),
  email: text().notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "restrict" }),
  roles: roleEnum().array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
