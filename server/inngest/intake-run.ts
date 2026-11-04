import { and, eq, gt, sql } from "drizzle-orm"

import type { Database } from "@/db"
import { notifications } from "@/db/schema"

import { getDatabase } from "@/server/database"
import {
  itAdmins,
  pullNewRequests,
  type IntakeSummary,
} from "@/server/intake/intake"
import { notify } from "@/server/notifications/notifications"

import { inngest } from "./client"

export type IntakeRunOptions = {
  database: () => Database
  pull?: (database: Database) => Promise<IntakeSummary>
}

// Any id works, as long as nothing else locks with it.
const failureLock = sql`hashtext('intake_failed')`

// A failure within this long of the last notice tells nobody again.
const quietPeriod = sql`now() - interval '6 hours'`

// Tells every company-wide IT/Admin that the intake has stopped. A second
// failure within 6 hours tells nobody, and the lock makes two failures at once
// send one notice.
export async function reportIntakeFailure(database: Database): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${failureLock})`)

    const [recent] = await transaction
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.kind, "intake_failed"),
          gt(notifications.createdAt, quietPeriod)
        )
      )
      .limit(1)

    if (recent) {
      return
    }

    const admins = await itAdmins(transaction)

    await notify(transaction, {
      personIds: admins.map((admin) => admin.id),
      kind: "intake_failed",
      title: "The intake run failed",
      text: "New website requests are not being pulled in. Inngest tried three more times; its dashboard shows the run.",
      path: "/admin/team",
    })
  })
}

// Pulls in new website requests every 5 minutes. A run that throws is retried
// three times, and one still going makes the next wait. A request that cannot
// be pulled in is reported in the summary and does not fail the run.
export function createIntakeRun({
  database,
  pull = pullNewRequests,
}: IntakeRunOptions) {
  return inngest.createFunction(
    {
      id: "intake-run",
      name: "Pull in new website requests",
      triggers: [{ cron: "*/5 * * * *" }],
      retries: 3,
      concurrency: { limit: 1 },
      onFailure: () => reportIntakeFailure(database()),
    },
    async () => {
      try {
        return await pull(database())
      } catch {
        // The pull's own error may quote a client's details, so none of it is
        // kept.
        throw new Error("The intake run failed")
      }
    }
  )
}

export const intakeRun = createIntakeRun({ database: getDatabase })
