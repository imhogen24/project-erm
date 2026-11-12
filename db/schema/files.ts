import {
  bigint,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { people, projects } from "./access"

// Where a file's bytes are kept. Moving storage means copying the bytes and
// changing this column; nothing else holds the storage's own links.
export const fileStorages = ["uploadthing"] as const

export const fileStorageEnum = pgEnum("file_storage", fileStorages)

// A file a person uploaded in the ERM. A record points at it as `file:<id>`,
// never by the storage's link, and the link is made fresh each time the file
// is opened. The project is empty until the upload is sent with a request.
export const files = pgTable("files", {
  id: uuid().primaryKey().defaultRandom(),
  storage: fileStorageEnum().notNull(),
  key: text().notNull().unique(),
  name: text().notNull(),
  size: bigint({ mode: "number" }).notNull(),
  contentType: text("content_type").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "restrict",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
