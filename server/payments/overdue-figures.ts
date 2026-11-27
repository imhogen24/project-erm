import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import {
  daysLate,
  penaltyOf,
  percentIn,
  shownDays,
} from "@/lib/overdue-account"
import { RECONCILED_PAYMENT } from "@/lib/reconciled-payment"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf } from "@/server/handoff/handoff"
import { expectedOf } from "@/server/payments/bank-check-submit"
import { paymentTerms, termOf } from "@/server/payments/draft-invoice"
import { isCyclePaid, matchingIn } from "@/server/payments/reconciled-submit"

// Kept apart from server/payments/overdue-account, with only light imports:
// server/records/records reads it as D3.11 locks, and the opening job's
// imports lead back to records.

type Reader = Pick<Transaction, "select">

const text = z.string().catch("")

const amount = z.number().optional().catch(undefined)

const signed = z
  .object({
    hofSignature: z
      .object({ signedAt: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({})

function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// The cycle's Payment Due Date, from its sent D3.6, or "" before it is sent.
export async function dueDateOf(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<string> {
  const [sent] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, TRANSMITTED_INVOICE),
        eq(toolRecords.cycle, cycle),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  return sent ? text.parse(sent.payload.paymentDueDate) : ""
}

// The day the cycle's payment cleared: its approved D3.8's Date Cleared in
// Bank, once paid.
async function clearedOn(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<string | undefined> {
  if (!(await isCyclePaid(database, projectId, cycle))) {
    return undefined
  }

  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, RECONCILED_PAYMENT),
        eq(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.createdAt))
    .limit(1)

  return text.parse(record?.payload.dateCleared) || undefined
}

// 1.0's and 3.0's figures for a cycle: the due date, the days overdue up to
// today, or up to the clearance date once D3.8 is approved, what is still
// owed after the cycle's D3.7 deposits, D3.1's penalty term and the penalty
// it gives. Worked out each time D3.11 is shown, and stored as it locks.
export async function overdueFigures(
  database: Reader,
  projectId: string,
  cycle: number,
  today = new Date()
): Promise<JsonObject> {
  const [due, total, matching, cleared, terms] = await Promise.all([
    dueDateOf(database, projectId, cycle),
    expectedOf(database, projectId, cycle),
    matchingIn(database, projectId, cycle),
    clearedOn(database, projectId, cycle),
    paymentTerms(database, projectId),
  ])

  const term = termOf(terms.complianceRules, "Late Payment Penalty")
  const days = due ? daysLate(due, cleared ?? dayOf(today)) : undefined
  const deposited = amount.parse(matching.actualCleared) ?? 0

  const balance =
    total === undefined
      ? undefined
      : Math.max(0, Math.round((total - deposited) * 100) / 100)

  return {
    ...(due && { originalDueDate: due }),
    ...(days !== undefined && { daysOverdue: shownDays(days) }),
    ...(balance !== undefined && { outstandingBalance: balance }),
    penaltyRate: term,
    ...(balance !== undefined && {
      penaltyAccrued: penaltyOf(percentIn(term), balance, days ?? 0),
    }),
  }
}

// What D3.11 shows that the system fills, read live: the request ID, the
// project and client names, the project's PM and the day the PM signed;
// until it locks, the figures too. A locked D3.11 keeps the figures it
// locked with.
export async function overdueValues(
  database: Reader,
  projectId: string,
  record: { state: string; payload: JsonObject },
  cycle: number
): Promise<JsonObject> {
  const [[project], names, pm] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "PM"),
  ])

  const signedAt = signed.parse(record.payload).hofSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    assignedPm: pm,
    ...(record.state !== "locked" &&
      (await overdueFigures(database, projectId, cycle))),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
