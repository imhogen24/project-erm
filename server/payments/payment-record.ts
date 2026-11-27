import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { ghs } from "@/lib/cost-estimation"
import { PAYMENT_TERMS } from "@/lib/payment-terms"
import {
  DEFAULT_WINDOW,
  paymentStatuses,
  shownDate,
  type MilestoneDates,
} from "@/lib/payment-record"
import { RECONCILED_PAYMENT, YES } from "@/lib/reconciled-payment"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import type { Transaction } from "@/server/audit/audit"
import { contractValueOf } from "@/server/contract/advance"
import { baselineValues } from "@/server/contract/baseline"
import { dateExecutedOf } from "@/server/contract/executed-contract"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { cycleRecord } from "@/server/payments/approved-invoice"
import { paymentWindowDays } from "@/server/payments/transmitted-invoice"
import { snOf } from "@/server/records/options-from"

type Reader = Pick<Transaction, "select">

const text = z.string().optional().catch(undefined)

const amount = z.number().optional().catch(undefined)

const schedule = z
  .object({
    paymentSchedule: z
      .array(
        z
          .object({
            milestone: z.string().catch(""),
            amountDue: z.number().nullable().optional().catch(undefined),
          })
          .catch({ milestone: "" })
      )
      .catch([]),
  })
  .catch({ paymentSchedule: [] })

const stored = z
  .object({
    paymentSchedule: z
      .array(
        z
          .object({ sn: text, expectedTriggerDate: text })
          .catch({ sn: undefined, expectedTriggerDate: undefined })
      )
      .catch([]),
  })
  .catch({ paymentSchedule: [] })

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// What one milestone cleared and when: the day and amount, once known.
type Paid = MilestoneDates & { amount?: number }

// The advance, row 2.1: invoiced on D2.12's Date Issued, cleared on D2.14's
// Date Payment Cleared, each once its record is locked.
async function advancePaid(database: Reader, projectId: string): Promise<Paid> {
  const [executed, initiation] = await Promise.all([
    lockedPayload(database, projectId, "D2.12"),
    lockedPayload(database, projectId, "D2.14"),
  ])

  return {
    invoiced: text.parse(executed.invoiceDate),
    cleared: text.parse(initiation.paymentDate),
  }
}

// A milestone billed in a payment cycle: invoiced on the day its D3.6 was
// sent, and cleared on its D3.8's Date Cleared in Bank, for the Actual
// Amount Cleared, once that is approved with the funds fully accounted for.
async function cyclePaid(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<Paid> {
  const [sent, [reconciled]] = await Promise.all([
    cycleRecord(database, projectId, TRANSMITTED_INVOICE, cycle),
    database
      .select({ state: toolRecords.state, payload: toolRecords.payload })
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
      .limit(1),
  ])

  const paid =
    reconciled?.state === "locked" && reconciled.payload.fundsAccounted === YES

  return {
    invoiced:
      sent?.state === "locked" ? text.parse(sent.payload.dateSent) : undefined,
    ...(paid && {
      cleared: text.parse(reconciled.payload.dateCleared),
      amount: amount.parse(reconciled.payload.actualCleared),
    }),
  }
}

// Which payment cycle bills each of D3.1's milestones, by its SN: the
// milestone each cycle's D3.3 picked.
async function cyclesBySn(
  database: Reader,
  projectId: string
): Promise<Map<string, number>> {
  const triggers = await database
    .select({ cycle: toolRecords.cycle, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, BILLING_TRIGGER),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(asc(toolRecords.cycle))

  return new Map(
    triggers.flatMap((trigger) => {
      const sn = snOf(text.parse(trigger.payload.milestone) ?? "")

      return sn ? [[sn, trigger.cycle]] : []
    })
  )
}

// The day D3.2 opened: the day D3.1 was first locked.
async function initiatedOn(database: Reader, projectId: string) {
  const [first] = await database
    .select({ lockedAt: toolRecords.lockedAt })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, PAYMENT_TERMS),
        isNotNull(toolRecords.lockedAt)
      )
    )
    .orderBy(asc(toolRecords.lockedAt))
    .limit(1)

  return first?.lockedAt ? dayOf(first.lockedAt) : undefined
}

// What D3.2 shows, read live each time: 1.0's officer, date and names; 2.0's
// rows, one per milestone of D3.1's locked schedule, each with its Expected
// Trigger Date as saved by its SN (row 2.1 starts on D2.12's Date Fully
// Executed until the FO saves), the day it was invoiced and cleared, and its
// status against D3.1's payment window; and 3.0's totals. A milestone
// cleared through D3.8 counts its reconciled amount, any other its Expected
// Amount. `today` is the day the statuses are worked out for.
export async function paymentRecordValues(
  database: Reader,
  projectId: string,
  record: { payload: JsonObject } | null,
  today = dayOf(new Date())
): Promise<JsonObject> {
  const [
    [project],
    names,
    officer,
    initiated,
    terms,
    window,
    total,
    executed,
    advance,
    cycles,
  ] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "FO"),
    initiatedOn(database, projectId),
    lockedPayload(database, projectId, PAYMENT_TERMS),
    paymentWindowDays(database, projectId),
    contractValueOf(database, projectId),
    dateExecutedOf(database, projectId),
    advancePaid(database, projectId),
    cyclesBySn(database, projectId),
  ])

  const milestones = schedule.parse(terms).paymentSchedule

  const saved = new Map(
    stored
      .parse(record?.payload ?? {})
      .paymentSchedule.flatMap((row) => (row.sn ? [[row.sn, row]] : []))
  )

  const paid = await Promise.all(
    milestones.map((_, index) => {
      if (index === 0) {
        return advance
      }

      const cycle = cycles.get(`2.${index + 1}`)

      return cycle === undefined
        ? ({} satisfies Paid)
        : cyclePaid(database, projectId, cycle)
    })
  )

  const statuses = paymentStatuses(paid, window ?? DEFAULT_WINDOW, today)

  const rows = milestones.map((milestone, index) => {
    const sn = `2.${index + 1}`
    const expected = milestone.amountDue ?? undefined

    const trigger = record
      ? saved.get(sn)?.expectedTriggerDate
      : index === 0
        ? executed
        : undefined

    return {
      sn,
      milestone: milestone.milestone,
      expectedAmount: expected === undefined ? "" : ghs(expected),
      ...(trigger && { expectedTriggerDate: trigger }),
      actualInvoiceDate: shownDate(paid[index]?.invoiced),
      actualClearanceDate: shownDate(paid[index]?.cleared),
      status: statuses[index] ?? "",
    }
  })

  const cleared = milestones.reduce((sum, milestone, index) => {
    const row = paid[index]

    return row?.cleared ? sum + (row.amount ?? milestone.amountDue ?? 0) : sum
  }, 0)

  return {
    ...names,
    requestId: project?.requestId ?? "",
    trackingOfficer: officer,
    ...(initiated && { dateInitiated: initiated }),
    paymentSchedule: rows,
    totalProjectValue: total === undefined ? "" : ghs(total),
    totalCleared: ghs(cleared),
    outstandingBalance: total === undefined ? "" : ghs(total - cleared),
  }
}
