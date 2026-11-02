import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { projects, serviceTrackEnum } from "./access"
import type { JsonObject } from "./records"

// The ERM's own copy of each website submission, saved when it is pulled in.
// A row here means the request is already in, so it is never pulled in again,
// and once it is in the ERM no longer needs the website's row. The submission
// is the whole website row, exactly as read. The project is empty until the
// intake creates it.
export const intakeSubmissions = pgTable("intake_submissions", {
  id: uuid().primaryKey().defaultRandom(),
  requestId: text("request_id").notNull().unique(),
  serviceTrack: serviceTrackEnum("service_track").notNull(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "restrict",
  }),
  submission: jsonb().$type<JsonObject>().notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
