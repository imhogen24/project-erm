import { eq, notExists, sql } from "drizzle-orm"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  type JsonObject,
  type ServiceTrack,
} from "@/db/schema"
import {
  customEngineeringSubmissions,
  draftingDigitizationSubmissions,
} from "@/db/website/schema"

import type { Transaction } from "@/server/audit/audit"

// A website row not yet pulled in. The row is the whole website row with the
// website's own column names, exactly as read. It holds client details, so
// nothing here puts it in a log or an error message.
export type WebsiteSubmission = {
  requestId: string
  serviceTrack: ServiceTrack
  createdAt: Date
  row: JsonObject
}

export type IntakeSubmission = typeof intakeSubmissions.$inferSelect

// The track comes from the table the row is in.
const sources = [
  { serviceTrack: "Tier_1", table: customEngineeringSubmissions },
  { serviceTrack: "Tier_3", table: draftingDigitizationSubmissions },
] as const

// Only reads the website's tables. A row whose request ID has a copy is
// already in and is left out. Oldest first, across both tables.
export async function findNewSubmissions(
  database: Database | Transaction
): Promise<WebsiteSubmission[]> {
  const found = await Promise.all(
    sources.map(async ({ serviceTrack, table }) => {
      const rows = await database
        .select({
          requestId: table.requestId,
          createdAt: table.createdAt,
          row: sql<JsonObject>`to_jsonb(${table})`,
        })
        .from(table)
        .where(
          notExists(
            database
              .select({ id: intakeSubmissions.id })
              .from(intakeSubmissions)
              .where(eq(intakeSubmissions.requestId, table.requestId))
          )
        )

      return rows.map((row) => ({ ...row, serviceTrack }))
    })
  )

  return found
    .flat()
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.requestId.localeCompare(b.requestId)
    )
}

// Saves the ERM's copy. The unique request ID makes a second call, even one
// running at the same moment, keep the first copy and return it unchanged.
export async function copySubmission(
  transaction: Transaction,
  submission: WebsiteSubmission
): Promise<IntakeSubmission> {
  const [copy] = await transaction
    .insert(intakeSubmissions)
    .values({
      requestId: submission.requestId,
      serviceTrack: submission.serviceTrack,
      submission: submission.row,
    })
    .onConflictDoNothing({ target: intakeSubmissions.requestId })
    .returning()

  if (copy) {
    return copy
  }

  const [existing] = await transaction
    .select()
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.requestId, submission.requestId))

  return existing!
}
