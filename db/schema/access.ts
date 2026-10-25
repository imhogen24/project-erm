import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
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
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// The reserved person that automated jobs act as, such as the website intake
// creating D1.1. A migration creates it in every database. It has no account,
// holds no roles and cannot sign in: a check on each of those tables refuses it.
export const systemPerson = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "System",
  email: "system@erm.invalid",
} as const

// For a check that refuses the system person in a person_id column.
export function notSystemPerson(column: AnyPgColumn) {
  return sql`${column} <> ${sql.raw(`'${systemPerson.id}'`)}`
}

export const serviceTracks = ["Tier_1", "Tier_3"] as const

export type ServiceTrack = (typeof serviceTracks)[number]

export const serviceTrackEnum = pgEnum("service_track", serviceTracks)

// Only an active project can have records created or moved. The others are
// read only.
export const projectStatuses = [
  "active",
  "on_hold",
  "rejected",
  "closed",
  "completed",
] as const

export type ProjectStatus = (typeof projectStatuses)[number]

export const projectStatusEnum = pgEnum("project_status", projectStatuses)

// The request ID is the one the website gave the client, stored exactly as it
// wrote it, for example "T1-1789787898386". It and the service track are set
// when the project is created and never change.
export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  requestId: text("request_id").notNull().unique(),
  serviceTrack: serviceTrackEnum("service_track").notNull(),
  status: projectStatusEnum().notNull().default("active"),
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
    check("person_project_roles_not_system", notSystemPerson(table.personId)),
  ]
)

// A role held here applies to every project, including ones made later. A
// Client is always tied to their own project, so Client is never held here.
export const personCompanyRoles = pgTable(
  "person_company_roles",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: roleEnum().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.role] }),
    check("person_company_roles_not_client", sql`${table.role} <> 'Client'`),
    check("person_company_roles_not_system", notSystemPerson(table.personId)),
  ]
)
