import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject } from "@/db/schema"
import { accountChecked, varianceOf } from "@/lib/bank-statement-log"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import type { Transaction } from "@/server/audit/audit"
import type { FieldError } from "@/server/records/validate"

// Kept apart from server/payments/bank-statement-log, with only light
// imports: server/records/records reads it on submit, and the reminder's
// imports lead back to records.

type Reader = Pick<Transaction, "select">

const amount = z.number().optional().catch(undefined)

// The cycle's TOTAL AMOUNT DUE, from its locked D3.4: the amount D3.6 sent.
export async function expectedOf(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<number | undefined> {
  const [draft] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, DRAFT_INVOICE),
        eq(toolRecords.cycle, cycle),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  return draft ? amount.parse(draft.payload.totalAmountDue) : undefined
}

// What submitting a check stores: the account checked, the invoice's total
// and the variance, so the locked check keeps what the FO saw, and the
// submit rules read the variance (3.0 Yes only at 0.00).
export async function bankLogOnSubmit(
  database: Reader,
  projectId: string,
  cycle: number,
  payload: JsonObject
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  const expected = await expectedOf(database, projectId, cycle)

  const variance = varianceOf({
    ...payload,
    ...(expected !== undefined && { expectedAmount: expected }),
  })

  return {
    values: {
      accountChecked: accountChecked(),
      ...(expected !== undefined && { expectedAmount: expected }),
      ...(variance !== undefined && { variance }),
    },
    errors: [],
  }
}
