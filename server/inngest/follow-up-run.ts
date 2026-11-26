import type { Database } from "@/db"
import { sendSignatureReminders } from "@/server/contract/signature-contract"
import { sendTransmittalFollowUps } from "@/server/contract/transmittal"
import { getDatabase } from "@/server/database"
import { sendBankCheckReminders } from "@/server/payments/bank-statement-log"
import { sendInvoiceReminders } from "@/server/payments/transmitted-invoice"

import { inngest } from "./client"

export type FollowUpRunOptions = { database: () => Database }

// Every hour, reminds each client who has not answered a draft contract three
// days after D2.7 sent it, when the Contract Admin asked for a follow-up; and
// each client who has not signed the final contract D2.11 sent, every three
// days, flagging it to the CA and PM at seven days. Each reminder is sent
// once, so a run that overlaps the last sends nothing twice. It also reminds
// each client seven days before a milestone invoice D3.6 sent is due, and,
// from 9:00 each working day, the Finance Officer whose milestone payment
// D3.7 is still waiting for.
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
        return {
          followUps: await sendTransmittalFollowUps(database()),
          signatureReminders: await sendSignatureReminders(database()),
          invoiceReminders: await sendInvoiceReminders(database()),
          bankCheckReminders: await sendBankCheckReminders(database()),
        }
      } catch {
        // The error may quote a client's details, so none of it is kept.
        throw new Error("The contract follow-ups failed")
      }
    }
  )
}

export const followUpRun = createFollowUpRun({ database: getDatabase })
