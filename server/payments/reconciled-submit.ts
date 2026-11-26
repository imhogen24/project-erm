import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject } from "@/db/schema"
import { BANK_STATEMENT_LOG } from "@/lib/bank-statement-log"
import { RECONCILED_PAYMENT, YES, matchingOf } from "@/lib/reconciled-payment"
import type { Transaction } from "@/server/audit/audit"
import { expectedOf } from "@/server/payments/bank-check-submit"
import type { FieldError } from "@/server/records/validate"

// Kept apart from server/payments/reconciled-payment, with only light
// imports: server/records/records reads it on submit, and the D3.6 reminder
// reads whether a milestone is paid.

type Reader = Pick<Transaction, "select">

const rows = z.array(z.record(z.string(), z.unknown())).catch([])

// A tool's record in one payment milestone cycle, never a voided one.
async function inCycle(
  database: Reader,
  projectId: string,
  toolId: string,
  cycle: number
) {
  const [record] = await database
    .select({ state: toolRecords.state, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        eq(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.createdAt))
    .limit(1)

  return record
}

// Every bank check of the milestone: the locked one, when the log is locked,
// then those kept under its Earlier Checks. An open check counts once it is
// submitted, which locks it.
export async function bankChecksOf(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<JsonObject[]> {
  const log = await inCycle(database, projectId, BANK_STATEMENT_LOG, cycle)

  if (!log) {
    return []
  }

  // SAFETY: rows of cells read from the saved payload.
  const kept = rows.parse(log.payload.earlierChecks) as JsonObject[]

  return log.state === "locked" ? [log.payload, ...kept] : kept
}

// 2.0 of a cycle's D3.8, read live: the invoice's TOTAL AMOUNT DUE, the sum
// of every deposit its bank checks logged, the latest value date and the
// variance.
export async function matchingIn(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<JsonObject> {
  const [expected, checks] = await Promise.all([
    expectedOf(database, projectId, cycle),
    bankChecksOf(database, projectId, cycle),
  ])

  return matchingOf(expected, checks)
}

// What submitting D3.8 stores: 2.0's sums, so the submitted copy keeps what
// the FO matched, and the project ledger (D3.2) reads the clearance date and
// the amount cleared from the approved one.
export async function reconciledOnSubmit(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  return { values: await matchingIn(database, projectId, cycle), errors: [] }
}

// Whether the milestone's invoice is paid: its D3.8 approved with the funds
// fully accounted for. D3.9, D3.10 and D3.11 read it, and the PAID badge on
// the milestone's invoice tools shows it.
export async function isCyclePaid(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<boolean> {
  const record = await inCycle(database, projectId, RECONCILED_PAYMENT, cycle)

  return record?.state === "locked" && record.payload.fundsAccounted === YES
}
