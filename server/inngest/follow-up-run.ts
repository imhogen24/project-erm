import type { Database } from "@/db"
import { sendTransmittalFollowUps } from "@/server/contract/transmittal"
import { getDatabase } from "@/server/database"

import { inngest } from "./client"

export type FollowUpRunOptions = { database: () => Database }

// Every hour, reminds each client who has not answered a draft contract three
// days after D2.7 sent it, when the Contract Admin asked for a follow-up. A
// reminder is sent once, so a run that overlaps the last sends nothing twice.
export function createFollowUpRun({ database }: FollowUpRunOptions) {
  return inngest.createFunction(
    {
      id: "follow-up-run",
      name: "Remind clients about unanswered draft contracts",
      triggers: [{ cron: "0 * * * *" }],
      retries: 3,
      concurrency: { limit: 1 },
    },
    async () => {
      try {
        return await sendTransmittalFollowUps(database())
      } catch {
        // The error may quote a client's details, so none of it is kept.
        throw new Error("The contract follow-up failed")
      }
    }
  )
}

export const followUpRun = createFollowUpRun({ database: getDatabase })
