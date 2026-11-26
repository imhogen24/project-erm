import { and, desc, eq, lt, ne } from "drizzle-orm"
import { z } from "zod"

import {
  intakeSubmissions,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { companyBank } from "@/lib/company"
import { computedCells } from "@/lib/computed-columns"
import { ghs } from "@/lib/cost-estimation"
import {
  DRAFT_INVOICE,
  invoiceSums,
  paymentDueText,
  percentIn,
  vatOf,
} from "@/lib/draft-invoice"
import { PAYMENT_TERMS, complianceRules } from "@/lib/payment-terms"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { lockedPayload } from "@/server/handoff/handoff"
import { snOf } from "@/server/records/options-from"
import type { FieldError } from "@/server/records/validate"
import { tools } from "@/server/tools/registry"

type Reader = Pick<Transaction, "select">

// What a submit stores, and what stops it.
type Submitted = { values: JsonObject; errors: FieldError[] }

const text = z.string().catch("")

const terms = z
  .object({
    paymentSchedule: z
      .array(
        z
          .object({
            milestone: text,
            percentage: z.number().optional().catch(undefined),
            amountDue: z.number().nullable().optional().catch(undefined),
          })
          .catch({ milestone: "" })
      )
      .catch([]),
    complianceRules: z
      .array(
        z
          .object({
            category: z.string().optional().catch(undefined),
            term: text,
          })
          .catch({ term: "" })
      )
      .catch([]),
  })
  .catch({ paymentSchedule: [], complianceRules: [] })

const request = z
  .object({
    organization_name: z.string().optional().catch(undefined),
    site_location: z.string().optional().catch(undefined),
  })
  .catch({})

const signed = z
  .object({
    foSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// D3.1's agreed term for one of its rule categories, such as "Tax / VAT
// Obligations": the row that names it, or the row in its place among the
// sheet's categories.
function termOf(
  rules: z.output<typeof terms>["complianceRules"],
  category: string
): string {
  const named = rules.find((rule) => rule.category === category)
  const index = complianceRules.findIndex((rule) => rule.category === category)

  return (named ?? rules[index])?.term ?? ""
}

async function paymentTerms(database: Reader, projectId: string) {
  return terms.parse(await lockedPayload(database, projectId, PAYMENT_TERMS))
}

// The record of a tool in one cycle, never a voided one.
async function cyclePayload(
  database: Reader,
  projectId: string,
  toolId: string,
  cycle: number
): Promise<JsonObject> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        eq(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )

  return record?.payload ?? {}
}

// Where the billing address starts: the address on the project's latest
// D3.4 before this cycle, or, on its first invoice, the client organisation
// and site location from the web request.
async function startingAddress(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<string> {
  const [earlier] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, DRAFT_INVOICE),
        lt(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const used = text.parse(earlier?.payload.billingAddress).trim()

  if (used) {
    return used
  }

  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const { organization_name, site_location } = request.parse(
    saved?.submission ?? {}
  )

  return [organization_name, site_location]
    .flatMap((line) => (line?.trim() ? [line.trim()] : []))
    .join("\n")
}

// Where a cycle's D3.4 starts before the FO saves anything: the billing
// address, line 2.1 on the milestone the cycle's D3.3 picked, as "<D3.1
// description> (<%>% Milestone)", quantity 1 at D3.1's Amount Due, an empty
// line 2.2, and the VAT at D3.1's tax rate of that line. The FO can change
// every one.
export async function draftInvoiceStart(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<JsonObject> {
  const [schedule, trigger, address] = await Promise.all([
    paymentTerms(database, projectId),
    cyclePayload(database, projectId, BILLING_TRIGGER, cycle),
    startingAddress(database, projectId, cycle),
  ])

  const sn = snOf(text.parse(trigger.milestone))
  const index = Number(sn.split(".")[1]) - 1
  const row = sn.startsWith("2.") ? schedule.paymentSchedule[index] : undefined

  const share =
    row?.percentage === undefined ? "" : ` (${row.percentage}% Milestone)`

  const price =
    row?.amountDue === null || row?.amountDue === undefined
      ? undefined
      : row.amountDue

  const first: JsonObject = row
    ? {
        description: `${row.milestone}${share}`,
        quantity: 1,
        ...(price !== undefined && { unitPrice: price }),
      }
    : {}

  const rate = percentIn(
    termOf(schedule.complianceRules, "Tax / VAT Obligations")
  )

  return {
    ...(address && { billingAddress: address }),
    lineItems: [first, {}],
    vat: vatOf(price ?? 0, rate),
  }
}

// What 1.0, 2.0's sums, 3.0 and 4.0 of D3.4 show, read live: the request ID,
// the project and client names, the company's bank details, D3.1's payment
// window, late penalty and tax rate, the subtotal and total of the lines
// saved, and the day the FO signed. Who drafted it and when are filled in as
// it locks; the invoice number is the record's own.
export async function draftInvoiceValues(
  database: Reader,
  projectId: string,
  record: { payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, schedule] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    paymentTerms(database, projectId),
  ])

  const rules = schedule.complianceRules
  const payload = record?.payload ?? {}
  const sums = invoiceSums(payload)
  const rate = percentIn(termOf(rules, "Tax / VAT Obligations"))
  const signedAt = signed.parse(payload).foSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    ...companyBank,
    paymentDueDate: paymentDueText(termOf(rules, "Invoice Payment Window")),
    latePenalty: termOf(rules, "Late Payment Penalty"),
    vatRate: rate ?? 0,
    subtotal: ghs(sums.subtotal),
    totalAmountDue: ghs(sums.total),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

// What submitting D3.4 stores, worked out again from the lines as saved:
// each line's Total Amount, the subtotal, the VAT (none when left empty) and
// the total due, so D3.5 reads the same amounts the FO saw.
export function draftInvoiceOnSubmit(payload: JsonObject): Submitted {
  const fields = tools.getTool(DRAFT_INVOICE)?.fields ?? []
  const sums = invoiceSums(payload)

  return {
    values: {
      ...computedCells(fields, payload, "stored"),
      subtotal: sums.subtotal,
      vat: sums.vat,
      totalAmountDue: sums.total,
    },
    errors: [],
  }
}
