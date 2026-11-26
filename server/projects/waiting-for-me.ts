import { and, eq, isNotNull, isNull } from "drizzle-orm"

import type { Database } from "@/db"
import { notifications } from "@/db/schema"

// The projects where something waits for this person, for the home page's
// "Needs me" filter: a notification about the project they haven't read, or a
// signature that is theirs to give (`signatures`, from signaturesWaitingFor).
export async function projectsWaitingFor(
  database: Database,
  personId: string,
  signatures: ReadonlyMap<string, readonly string[]>
): Promise<Set<string>> {
  const unread = await database
    .selectDistinct({ projectId: notifications.projectId })
    .from(notifications)
    .where(
      and(
        eq(notifications.personId, personId),
        isNull(notifications.readAt),
        isNotNull(notifications.projectId)
      )
    )

  return new Set([
    ...signatures.keys(),
    ...unread.flatMap((row) => (row.projectId ? [row.projectId] : [])),
  ])
}
