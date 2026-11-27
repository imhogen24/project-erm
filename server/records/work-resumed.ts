import { and, eq } from "drizzle-orm"

import { toolRecords, type JsonObject } from "@/db/schema"
import { HALT_TOLD, OVERDUE_ACCOUNTS, YES } from "@/lib/overdue-account"
import { RECONCILED_PAYMENT } from "@/lib/reconciled-payment"
import type { Transaction } from "@/server/audit/audit"
import {
  notifyLockAnnounced,
  type PendingEmail,
} from "@/server/notifications/raise"
import { isWorkHalted } from "@/server/permissions/work-halted"

// Once a milestone's D3.8 locks with the funds fully accounted for, and its
// D3.11 had halted the project's engineering work, the halt is lifted: the
// same people a halt tells are told work may resume, unless another
// milestone still holds a halt.
export async function announceWorkResumed(
  transaction: Transaction,
  actor: string,
  record: {
    id: string
    projectId: string
    toolId: string
    cycle: number
    payload: JsonObject
  }
): Promise<PendingEmail[]> {
  if (
    record.toolId !== RECONCILED_PAYMENT ||
    record.payload.fundsAccounted !== YES
  ) {
    return []
  }

  const [report] = await transaction
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, record.projectId),
        eq(toolRecords.toolId, OVERDUE_ACCOUNTS),
        eq(toolRecords.cycle, record.cycle),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  if (
    report?.payload.haltWork !== YES ||
    (await isWorkHalted(transaction, record.projectId))
  ) {
    return []
  }

  return notifyLockAnnounced(
    transaction,
    actor,
    record,
    HALT_TOLD,
    "engineering work may resume, as the overdue milestone payment is reconciled"
  )
}
