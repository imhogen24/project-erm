import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { RECONCILED_PAYMENT, YES } from "@/lib/reconciled-payment"
import { nextPhaseOf } from "@/lib/unblock-notice"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf } from "@/server/handoff/handoff"
import { cyclePayload, paymentTerms } from "@/server/payments/draft-invoice"
import { snOf } from "@/server/records/options-from"

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

// Where a cycle's D3.10 starts before the FO saves anything: 3.0's phase,
// the D3.1 milestone after the one the cycle's D3.3 billed, or empty on the
// last milestone. The FO can change it.
export async function unblockStart(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<JsonObject> {
  const [schedule, trigger] = await Promise.all([
    paymentTerms(database, projectId),
    cyclePayload(database, projectId, BILLING_TRIGGER, cycle),
  ])

  const sn = snOf(text.parse(trigger.milestone))

  const billed = sn.startsWith("2.") ? Number(sn.split(".")[1]) - 1 : -1

  const phase = nextPhaseOf(
    schedule.paymentSchedule,
    Number.isInteger(billed) ? billed : -1
  )

  return phase ? { phaseAuthorized: phase } : {}
}

// What cleared in the bank for the milestone: the Actual Amount Cleared of
// its newest D3.8, once approved with the funds fully accounted for.
async function securedAmount(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<number | undefined> {
  const [record] = await database
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
    .limit(1)

  return record?.state === "locked" && record.payload.fundsAccounted === YES
    ? amount.parse(record.payload.actualCleared)
    : undefined
}

// What D3.10 shows that the system fills, read live: the request ID, the
// day the FO submitted it, the project and client names, the project's PM
// and FO, the cycle's D3.8 amount cleared, and the day the PM signed.
export async function unblockValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null,
  cycle: number
): Promise<JsonObject> {
  const [[project], names, pm, fo, secured] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "PM"),
    holderOf(database, projectId, "FO"),
    securedAmount(database, projectId, cycle),
  ])

  const [submitted] = record
    ? await database
        .select({ submittedAt: toolRecords.submittedAt })
        .from(toolRecords)
        .where(eq(toolRecords.id, record.id))
    : []

  const signedAt = signed.parse(record?.payload ?? {}).hofSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    assignedPm: pm,
    issuingFo: fo,
    ...(secured !== undefined && { amountSecured: secured }),
    ...(submitted?.submittedAt && {
      noticeDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
