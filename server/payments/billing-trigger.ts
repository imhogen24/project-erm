import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, projects, toolRecords, type JsonObject } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import { PAYMENT_TERMS } from "@/lib/payment-terms"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { snOf } from "@/server/records/options-from"

type Reader = Pick<Transaction, "select">

const schedule = z
  .array(
    z
      .object({
        milestone: z.string().catch(""),
        percentage: z.number().optional().catch(undefined),
        amountDue: z.number().nullable().optional().catch(undefined),
      })
      .catch({ milestone: "" })
  )
  .catch([])

const saved = z
  .object({
    milestone: z.string().optional().catch(undefined),
    pmSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// What each of D3.1's milestones is worth, by its SN, as D3.3's Contractual
// Milestone Value shows it, such as "40% / GHS 37,760.00": the percentage
// and the Amount Due D3.1 stored when it was submitted. A milestone with no
// amount shows its percentage only.
export async function milestoneValues(
  database: Reader,
  projectId: string
): Promise<Map<string, string>> {
  const rows = schedule.parse(
    (await lockedPayload(database, projectId, PAYMENT_TERMS)).paymentSchedule
  )

  return new Map(
    rows.map((row, index) => {
      const share = row.percentage === undefined ? "" : `${row.percentage}%`

      const amount =
        row.amountDue === null || row.amountDue === undefined
          ? undefined
          : ghs(row.amountDue)

      return [
        `2.${index + 1}`,
        amount ? [share, amount].filter(Boolean).join(" / ") : share,
      ]
    })
  )
}

// The value shown for each option of Milestone Achieved, so the form shows
// the picked milestone's value as the PM picks it.
export async function milestoneValueOptions(
  database: Reader,
  projectId: string,
  options: readonly string[]
): Promise<Record<string, string>> {
  const values = await milestoneValues(database, projectId)

  return Object.fromEntries(
    options.flatMap((option) => {
      const shown = values.get(snOf(option))

      return shown ? [[option, shown]] : []
    })
  )
}

// What 1.0 and 2.0 of D3.3 show, read live: the request ID, the project and
// client names, the project's Finance Officer, who sent the trigger and
// when, the picked milestone's value, the day the PM signed, and, once
// submitted, the day the trigger reached Finance. The FO's decision is
// written on the record (decision in the tool's definition).
export async function billingTriggerValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, recipient, values] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "FO"),
    milestoneValues(database, projectId),
  ])

  const [submitted] = record
    ? await database
        .select({
          submittedAt: toolRecords.submittedAt,
          name: people.name,
        })
        .from(toolRecords)
        .leftJoin(people, eq(people.id, toolRecords.submittedBy))
        .where(eq(toolRecords.id, record.id))
    : []

  const { milestone, pmSignature } = saved.parse(record?.payload ?? {})
  const value = milestone ? values.get(snOf(milestone)) : undefined
  const sentOn = submitted?.submittedAt?.toISOString().slice(0, 10)

  return {
    ...names,
    requestId: project?.requestId ?? "",
    recipient,
    ...(value && { milestoneValue: value }),
    ...(submitted?.name && { triggerSentBy: submitted.name }),
    ...(sentOn && { dateSent: sentOn }),
    ...(sentOn &&
      record?.payload.dateReceived === undefined && { dateReceived: sentOn }),
    ...(pmSignature?.signedAt && {
      signedDate: pmSignature.signedAt.slice(0, 10),
    }),
  }
}
