import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, projects, toolRecords, type JsonObject } from "@/db/schema"
import { computedCells } from "@/lib/computed-columns"
import { ghs } from "@/lib/cost-estimation"
import {
  complianceRules,
  currencyTerm,
  paymentMilestones,
} from "@/lib/payment-terms"
import type { Transaction } from "@/server/audit/audit"
import { contractValueOf } from "@/server/contract/advance"
import { baselineValues } from "@/server/contract/baseline"
import { lockedPayload } from "@/server/handoff/handoff"
import type { FieldError } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"
import { PAYMENT_TERMS } from "@/lib/payment-terms"

type Reader = Pick<Transaction, "select">

const template = z
  .object({
    executionPercentage: z.number().optional().catch(undefined),
    currency: z.string().optional().catch(undefined),
  })
  .catch({})

const signed = z
  .object({
    foSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ foSignature: undefined })

// Where D3.1 starts before the FO saves anything: 2.0 on the sheet's three
// milestones, the first on D2.1's Payable upon Execution (%), and 3.0 on the
// sheet's agreed terms, the currency's built from D2.1's Default Currency.
// The FO can change every one.
export async function paymentTermsStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { executionPercentage, currency } = template.parse(
    await lockedPayload(database, projectId, "D2.1")
  )

  return {
    paymentSchedule: paymentMilestones.map((milestone, index) => ({
      milestone,
      ...(index === 0 &&
        executionPercentage !== undefined && {
          percentage: executionPercentage,
        }),
    })),
    complianceRules: complianceRules.map(({ category, term }) => ({
      term: category === "Accepted Currency" ? currencyTerm(currency) : term,
    })),
  }
}

// What 1.0 and 4.0 of D3.1 show, read live: the request ID, the project and
// client names, the contract's total, who submitted it and when, and the day
// the FO signed.
export async function paymentTermsValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, value] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    contractValueOf(database, projectId),
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

  const signedAt = signed.parse(record?.payload ?? {}).foSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    totalProjectValue: value === undefined ? "" : ghs(value),
    ...(submitted?.name && { extractedBy: submitted.name }),
    ...(submitted?.submittedAt && {
      extractionDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

// What submitting D3.1 stores: each milestone's Amount Due, worked out again
// from its percentage of the contract's total, so the later Workbook 3 tools
// read the same amounts the FO saw. An amount stays empty while the total is
// unknown.
export async function paymentTermsOnSubmit(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  const value = await contractValueOf(database, projectId)
  const fields = tools.getTool(PAYMENT_TERMS)?.fields ?? []

  return {
    values: computedCells(
      fields,
      { ...payload, totalProjectValue: value ?? null },
      "stored"
    ),
    errors: [],
  }
}
