import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { APPROVED_INVOICE, YES, invoiceFileName } from "@/lib/approved-invoice"
import { companyBank, type BankDetails } from "@/lib/company"
import { ghs } from "@/lib/cost-estimation"
import { DRAFT_INVOICE, paymentDueText } from "@/lib/draft-invoice"
import { daysIn } from "@/lib/follow-dates"
import type { Fills } from "@/lib/placeholders"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { clientAndValue, holderOf } from "@/server/handoff/handoff"
import {
  cycleMilestone,
  paymentTerms,
  termOf,
} from "@/server/payments/draft-invoice"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"

type Reader = Pick<Transaction, "select">

const text = z.string().catch("")

const amount = z.number().optional().catch(undefined)

const signed = z
  .object({
    pmSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(when: Date) {
  return when.toISOString().slice(0, 10)
}

// A tool's record in one payment milestone cycle, never a voided one.
export async function cycleRecord(
  database: Reader,
  projectId: string,
  toolId: string,
  cycle: number
) {
  const [record] = await database
    .select({
      state: toolRecords.state,
      payload: toolRecords.payload,
      submittedAt: toolRecords.submittedAt,
      lockedAt: toolRecords.lockedAt,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        eq(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )

  return record
}

// What 1.0 and 4.0 of a cycle's D3.5 show, read live: the request ID, the
// project's PM as the Head of Finance, the day the cycle's D3.4 was
// submitted, the project and client names, and the day the PM signed.
export async function approvedInvoiceValues(
  database: Reader,
  projectId: string,
  record: { payload: JsonObject } | null,
  cycle: number
): Promise<JsonObject> {
  const [[project], names, officer, draft] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "PM"),
    cycleRecord(database, projectId, DRAFT_INVOICE, cycle),
  ])

  const received =
    draft?.state === "locked" ? (draft.submittedAt ?? draft.lockedAt) : null

  const signedAt = signed.parse(record?.payload ?? {}).pmSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    reviewingOfficer: officer,
    ...(received && { dateReceived: dayOf(received) }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

// What the app fills into D3.5's checks: the company's bank and branch,
// D3.1's payment window in days, and, beside check 2.1, the cycle's D3.4
// TOTAL AMOUNT DUE and D3.1's Amount Due for its milestone. A value not
// known yet leaves its [name] as it is written.
export async function approvedInvoiceFills(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<Fills> {
  const [schedule, milestone, draft] = await Promise.all([
    paymentTerms(database, projectId),
    cycleMilestone(database, projectId, cycle),
    cycleRecord(database, projectId, DRAFT_INVOICE, cycle),
  ])

  const days = daysIn(
    termOf(schedule.complianceRules, "Invoice Payment Window")
  )

  const total =
    draft?.state === "locked"
      ? amount.parse(draft.payload.totalAmountDue)
      : undefined

  const due = milestone?.amountDue ?? undefined

  return {
    "Bank Name": companyBank.bankName,
    Branch: companyBank.branch,
    ...(days !== undefined && { N: String(days) }),
    ...(total !== undefined && { "Invoice Total": ghs(total) }),
    ...(due !== undefined && { "Milestone Value": ghs(due) }),
  }
}

const lines = z
  .array(
    z
      .object({
        description: text,
        quantity: amount,
        unitPrice: amount,
        totalAmount: amount,
      })
      .catch({ description: "" })
  )
  .catch([])

// One line of the invoice the client receives.
export type InvoiceLine = {
  description: string
  quantity: number | undefined
  unitPrice: number | undefined
  total: number | undefined
}

// The invoice the client receives for one milestone, as the locked D3.4 and
// the approved D3.5 hold it.
export type Invoice = {
  fileName: string
  invoiceNumber: string
  invoiceDate: string
  clientName: string
  billingAddress: string
  projectName: string
  lines: InvoiceLine[]
  subtotal: number
  vat: number
  total: number
  bank: BankDetails
  paymentTerms: string
  latePenalty: string
}

export class InvoiceNotFoundError extends Error {}

// Whether this person may read the cycle's approved invoice: anyone who may
// read D3.5, and, once the cycle's D3.6 has sent it, anyone who may read
// D3.6, such as the client.
async function mayReadInvoice(
  database: Reader,
  personId: string,
  projectId: string,
  cycle: number
) {
  if (await can(database, personId, projectId, APPROVED_INVOICE, "read")) {
    return true
  }

  if (
    !(await can(database, personId, projectId, TRANSMITTED_INVOICE, "read"))
  ) {
    return false
  }

  const sent = await cycleRecord(
    database,
    projectId,
    TRANSMITTED_INVOICE,
    cycle
  )

  return sent?.state === "locked"
}

// The approved invoice of a milestone cycle, for someone who may read it:
// made from the cycle's locked D3.4 once its D3.5 is locked with Yes, each
// time it is asked for, so it can never differ from what was approved. The
// invoice date is the day D3.5 was approved.
export async function approvedInvoice(
  database: Reader,
  personId: string,
  projectId: string,
  cycle: number
): Promise<Invoice> {
  if (!(await mayReadInvoice(database, personId, projectId, cycle))) {
    throw new PermissionDeniedError(
      `Not allowed to read ${APPROVED_INVOICE} on this project`
    )
  }

  const [approval, draft] = await Promise.all([
    cycleRecord(database, projectId, APPROVED_INVOICE, cycle),
    cycleRecord(database, projectId, DRAFT_INVOICE, cycle),
  ])

  if (
    approval?.state !== "locked" ||
    approval.payload.authorized !== YES ||
    !approval.lockedAt ||
    draft?.state !== "locked"
  ) {
    throw new InvoiceNotFoundError(
      `Cycle ${cycle} of this project has no approved invoice`
    )
  }

  const [[project], known, schedule] = await Promise.all([
    database
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId)),
    clientAndValue(database, projectId),
    paymentTerms(database, projectId),
  ])

  const invoiceNumber = text.parse(draft.payload.invoiceNumber)
  const clientName = known?.clientName ?? project?.name ?? ""

  return {
    fileName: invoiceFileName(invoiceNumber, clientName),
    invoiceNumber,
    invoiceDate: dayOf(approval.lockedAt),
    clientName,
    billingAddress: text.parse(draft.payload.billingAddress),
    projectName: project?.name ?? "",
    lines: lines
      .parse(draft.payload.lineItems)
      .filter((line) => line.description.trim() !== "")
      .map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.totalAmount,
      })),
    subtotal: amount.parse(draft.payload.subtotal) ?? 0,
    vat: amount.parse(draft.payload.vat) ?? 0,
    total: amount.parse(draft.payload.totalAmountDue) ?? 0,
    bank: companyBank,
    paymentTerms: paymentDueText(
      termOf(schedule.complianceRules, "Invoice Payment Window")
    ),
    latePenalty: termOf(schedule.complianceRules, "Late Payment Penalty"),
  }
}

// The cycle's approved invoice for the D3.5 page, or null until D3.5 is
// approved with Yes.
export async function shownInvoice(
  database: Reader,
  personId: string,
  projectId: string,
  cycle: number
): Promise<Invoice | null> {
  try {
    return await approvedInvoice(database, personId, projectId, cycle)
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return null
    }

    throw error
  }
}
