import type { Database } from "@/db"
import { checkDeliveries } from "@/server/acknowledgement/delivery"
import { getDatabase } from "@/server/database"
import { getLookup, type DeliveryLookup } from "@/server/email/email"

import { inngest } from "./client"

export type DeliveryRunOptions = {
  database: () => Database
  // Read on each run when left out, so a key set later is used.
  lookup?: DeliveryLookup
}

// Asks the email service every 5 minutes what became of each D1.4 email still
// at Sent (RDP-151). An email it cannot ask about waits for the next run, so a
// run does not fail on that. One still going makes the next wait.
export function createDeliveryRun({ database, lookup }: DeliveryRunOptions) {
  return inngest.createFunction(
    {
      id: "delivery-run",
      name: "Check acknowledgement email delivery",
      triggers: [{ cron: "*/5 * * * *" }],
      retries: 3,
      concurrency: { limit: 1 },
    },
    async () => {
      try {
        return await checkDeliveries(database(), lookup ?? getLookup())
      } catch {
        // The error may quote a client's details, so none of it is kept.
        throw new Error("The delivery check failed")
      }
    }
  )
}

export const deliveryRun = createDeliveryRun({ database: getDatabase })
