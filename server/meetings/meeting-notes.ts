import { and, desc, eq } from "drizzle-orm"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"

import { CALENDAR_AGENDA } from "./calendar-invite"

export const MEETING_NOTES = "D1.7"

type Reader = Pick<Transaction, "select">

// The project's locked D1.6, which D1.7 starts from, or nothing when there is
// none.
export async function lockedCalendar(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, CALENDAR_AGENDA),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  return record?.payload ?? {}
}
