import type { JsonObject } from "@/db/schema"
import { OVERDUE_ACCOUNTS } from "@/lib/overdue-account"
import type { Transaction } from "@/server/audit/audit"
import { overdueFigures } from "@/server/payments/overdue-figures"

// The figures a tool works out live and keeps once it locks, such as
// D3.11's days overdue and penalty: stored on the record as it locks, so it
// keeps showing what it showed when it was signed. Empty for a tool with
// none.
export async function figuresOnLock(
  transaction: Pick<Transaction, "select">,
  record: { toolId: string; projectId: string; cycle: number },
  now: Date
): Promise<JsonObject> {
  switch (record.toolId) {
    case OVERDUE_ACCOUNTS: {
      return overdueFigures(transaction, record.projectId, record.cycle, now)
    }

    default: {
      return {}
    }
  }
}
