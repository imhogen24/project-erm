import { and, desc, eq, lt, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  emailLog,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { companyBank } from "@/lib/company"
import { ghs } from "@/lib/cost-estimation"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import { daysIn } from "@/lib/follow-dates"
import type { Fills } from "@/lib/placeholders"
import {
  NO,
  RECONCILED_PAYMENT,
  TRANSMITTED_INVOICE,
  YES,
  dueDateOf,
  reminderDayOf,
  scriptFor,
  sentInvoiceEmailPath,
  shownDay,
  subjectFor,
} from "@/lib/transmitted-invoice"
import {
  EmailRefusedError,
  SendNotReadyError,
  acknowledgementDraft,
} from "@/server/acknowledgement/acknowledgement"
import type { Transaction } from "@/server/audit/audit"
import { namesOf } from "@/server/contract/transmittal"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import {
  approvedInvoice,
  cycleRecord,
  type Invoice,
} from "@/server/payments/approved-invoice"
import {
  cycleMilestone,
  cyclePayload,
  paymentTerms,
  termOf,
} from "@/server/payments/draft-invoice"
import { invoicePdf } from "@/server/pdf/invoice-pdf"
import { assertCan } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  lockDraftIn,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

type Reader = Pick<Transaction, "select">

const text = z.string().catch("")

const amount = z.number().optional().catch(undefined)

const address = z.email()

// The parts of a saved D3.6 that sending and the reminder read.
const saved = z.object({
  sentTo: z.string().optional().catch(undefined),
  ccBcc: z.string().optional().catch(undefined),
  subject: z.string().optional().catch(undefined),
  script: z.string().optional().catch(undefined),
  dateSent: z.string().optional().catch(undefined),
  timeSent: z.string().optional().catch(undefined),
  paymentDueDate: z.string().optional().catch(undefined),
  reminderScheduled: z.string().optional().catch(undefined),
})

function savedOf(payload: JsonObject) {
  return saved.parse(payload)
}

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// D3.1's payment window in days, such as 21 for "Net 21 Days from Invoice
// Issuance". Undefined when the window names no days.
export async function paymentWindowDays(
  database: Reader,
  projectId: string
): Promise<number | undefined> {
  const schedule = await paymentTerms(database, projectId)

  return daysIn(termOf(schedule.complianceRules, "Invoice Payment Window"))
}

// The email of the project's PM, whom the invoice email copies, or "" when
// the project has none.
async function pmEmailOf(database: Reader, projectId: string) {
  const [pm] = await database
    .select({ email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "PM")
      )
    )
    .limit(1)

  return pm?.email ?? ""
}

// The cycle's invoice number and TOTAL AMOUNT DUE, from its locked D3.4.
async function invoiceOf(database: Reader, projectId: string, cycle: number) {
  const draft = await cycleRecord(database, projectId, DRAFT_INVOICE, cycle)

  if (draft?.state !== "locked") {
    return { invoiceNumber: "", total: undefined }
  }

  return {
    invoiceNumber: text.parse(draft.payload.invoiceNumber),
    total: amount.parse(draft.payload.totalAmountDue),
  }
}

// Where Sent To starts: the address the project's previous D3.6 went to,
// or, for the first invoice, the client's email from the web request.
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
        eq(toolRecords.toolId, TRANSMITTED_INVOICE),
        lt(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const used = text.parse(earlier?.payload.sentTo).trim()

  if (used) {
    return used
  }

  const { sentTo } = await acknowledgementDraft(database, projectId)

  return sentTo ?? ""
}

// The covering message for the cycle, as if the invoice went on `day`.
async function scriptOn(
  database: Reader,
  projectId: string,
  cycle: number,
  day: string
) {
  const [{ clientName }, milestone, invoice, days] = await Promise.all([
    namesOf(database, projectId),
    cycleMilestone(database, projectId, cycle),
    invoiceOf(database, projectId, cycle),
    paymentWindowDays(database, projectId),
  ])

  return scriptFor({
    clientName,
    milestone: milestone?.milestone,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.total === undefined ? undefined : ghs(invoice.total),
    dueDate: dueDateOf(day, days),
    windowDays: days,
    bankName: companyBank.bankName,
  })
}

// Where a cycle's D3.6 starts before the FO saves anything: the client's
// billing email, and the sheet's covering message with the client, the
// milestone, the invoice number and amount, the due date if sent today, the
// payment window and the bank filled in. The FO can change both until the
// invoice is sent.
export async function transmittedInvoiceStart(
  database: Reader,
  projectId: string,
  cycle: number,
  today = new Date()
): Promise<JsonObject> {
  const [sentTo, script] = await Promise.all([
    startingAddress(database, projectId, cycle),
    scriptOn(database, projectId, cycle, dayOf(today)),
  ])

  return { ...(sentTo && { sentTo }), script }
}

// What the system fills into D3.6, read live: the request ID always; until
// the invoice is sent, the PM's email, the subject with D3.4's invoice
// number, and the due date if sent today. Once sent, what went out is stored
// and shown instead.
export async function transmittedInvoiceValues(
  database: Reader,
  projectId: string,
  payload: JsonObject,
  cycle: number,
  today = new Date()
): Promise<JsonObject> {
  const [[project], days] = await Promise.all([
    database
      .select({ requestId: projects.requestId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId)),
    paymentWindowDays(database, projectId),
  ])

  const requestId = project?.requestId ?? ""

  if (savedOf(payload).dateSent) {
    return { requestId }
  }

  const [pm, invoice] = await Promise.all([
    pmEmailOf(database, projectId),
    invoiceOf(database, projectId, cycle),
  ])

  const due = dueDateOf(dayOf(today), days)

  return {
    requestId,
    ccBcc: pm,
    subject: subjectFor(invoice.invoiceNumber, project?.name ?? ""),
    ...(due && { paymentDueDate: due }),
  }
}

// What the app fills into D3.6's labels: D3.1's payment window in days, as
// in "Payment Clock Started? (Day 1 of 21)".
export async function transmittedInvoiceFills(
  database: Reader,
  projectId: string
): Promise<Fills> {
  const days = await paymentWindowDays(database, projectId)

  return days === undefined ? {} : { N: String(days) }
}

// What still stops D3.6 being sent, in the words the Send button shows.
export function missingToSend(payload: JsonObject): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!address.safeParse(values.sentTo?.trim()).success) {
    missing.push("a valid client billing email in Sent To")
  }

  if (!values.script?.trim()) {
    missing.push("the covering message")
  }

  return missing
}

async function loadTransmitted(database: Reader, recordId: string) {
  const [record] = await database
    .select({
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      cycle: toolRecords.cycle,
      createdAt: toolRecords.createdAt,
    })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== TRANSMITTED_INVOICE) {
    throw new RecordNotFoundError(
      `No ${TRANSMITTED_INVOICE} record ${recordId}`
    )
  }

  return record
}

// The script as it goes: the due date the start wrote, for the day the
// record was made, moved to the due date for the day it is sent.
function scriptWithDue(
  script: string,
  started: string | undefined,
  due: string | undefined
) {
  return started && due && started !== due
    ? script.replaceAll(shownDay(started), shownDay(due))
    : script
}

// The FO's Send on D3.6: emails the cycle's approved invoice PDF to Sent To,
// copying the PM, with the subject and the covering message, and keeps a
// copy of the email. Date Sent, Time Sent and the payment due date are
// filled in before the email goes, which freezes Sent To and the message, so
// an edit saved meanwhile cannot make the record differ from the email. Once
// it has gone, 3.0 is filled in and D3.6 locks. The record's ID is the
// email's key, so pressing twice sends one email; when the email service
// refuses it, what was filled in is cleared again and the FO can send again.
export async function sendTransmittedInvoice(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const { projectId, cycle, createdAt } = await loadTransmitted(
    database,
    recordId
  )

  await assertCan(database, actor, projectId, TRANSMITTED_INVOICE, "write")

  const now = options.now ?? new Date()

  const [project] = await database
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  const [pm, days, invoice] = await Promise.all([
    pmEmailOf(database, projectId),
    paymentWindowDays(database, projectId),
    approvedInvoice(database, actor, projectId, cycle).catch(() => undefined),
  ])

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const current = await unsentDraft(transaction, recordId)
    const missing = missingToSend(current.payload)

    if (!invoice) {
      missing.push("this milestone's approved invoice (D3.5)")
    }

    if (missing.length > 0 || !invoice) {
      throw new SendNotReadyError(missing)
    }

    const values = savedOf(current.payload)
    const dateSent = dayOf(now)
    const due = dueDateOf(dateSent, days)

    const script = scriptWithDue(
      values.script!,
      dueDateOf(dayOf(createdAt), days),
      due
    )

    const sending = {
      to: values.sentTo!.trim(),
      cc: pm ? [pm] : [],
      subject: subjectFor(invoice.invoiceNumber, project?.name ?? ""),
      script,
      dateSent,
      due,
      invoice,
    }

    await setSystemValues(
      transaction,
      actor,
      recordId,
      {
        ...timeOf(now),
        ccBcc: pm,
        subject: sending.subject,
        paymentDueDate: due ?? null,
        ...(script !== values.script && { script }),
      },
      "Sending the invoice to the client",
      "draft",
      ["script"]
    )

    return sending
  })

  const sent = await deliver(database, {
    projectId,
    recordId,
    invoice: prepared.invoice,
    prepared,
    transport: options.transport ?? getTransport(),
  })

  if (sent.status !== "sent" && sent.status !== "delivered") {
    // Only a refused email is undone: one still queued is another press's,
    // which records itself.
    if (sent.status === "failed") {
      await database.transaction((transaction) =>
        setSystemValues(
          transaction,
          actor,
          recordId,
          { dateSent: null, timeSent: null, paymentDueDate: null },
          "The email service refused the invoice",
          "draft"
        )
      )
    }

    throw new EmailRefusedError(
      sent.status === "failed"
        ? `The email service did not send it: ${sent.error ?? "no reason given"}. Press Send to try again.`
        : "This invoice is already being sent. Reload the page in a moment."
    )
  }

  const reminder = reminderDayOf(prepared.dateSent, prepared.due)

  return database.transaction((transaction) =>
    lockDraftIn(transaction, actor, recordId, {
      sentEmailLink: sentInvoiceEmailPath(projectId, cycle),
      paymentClockStarted: YES,
      reminderScheduled: reminder ? YES : NO,
    })
  )
}

function timeOf(at: Date) {
  const iso = at.toISOString()

  return { dateSent: iso.slice(0, 10), timeSent: iso.slice(11, 16) }
}

// A draft D3.6 not yet sent, held for this transaction.
async function unsentDraft(
  transaction: Transaction,
  recordId: string
): Promise<ToolRecord> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      current.state === "locked"
        ? "This invoice has already been sent"
        : `A ${current.state} record cannot be sent`
    )
  }

  if (savedOf(current.payload).dateSent) {
    throw new InvalidTransitionError("This invoice is already being sent")
  }

  return current
}

// The email itself, with the approved invoice's PDF. Anything that stops it
// before the email service answers counts as refused.
async function deliver(
  database: Database,
  input: {
    projectId: string
    recordId: string
    invoice: Invoice
    prepared: { to: string; cc: string[]; subject: string; script: string }
    transport: Transport
  }
) {
  try {
    const pdf = await invoicePdf(input.invoice)

    return await sendEmail(
      database,
      {
        to: input.prepared.to,
        cc: input.prepared.cc,
        kind: "invoice_transmittal",
        data: {
          subject: input.prepared.subject,
          body: input.prepared.script,
          attachment: {
            filename: input.invoice.fileName,
            content: pdf.content.toString("base64"),
          },
        },
        projectId: input.projectId,
        recordId: input.recordId,
        key: `invoice_transmittal:${input.recordId}`,
        keepCopy: true,
      },
      input.transport
    )
  } catch (error) {
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    }
  }
}

// Whether the cycle's payment is already reconciled: its D3.8 locked.
async function reconciled(database: Reader, projectId: string, cycle: number) {
  const record = await cycleRecord(
    database,
    projectId,
    RECONCILED_PAYMENT,
    cycle
  )

  return record?.state === "locked"
}

// The reminder, run every hour: each sent D3.6 with a reminder scheduled
// whose reminder day, seven days before the due date, has come, emails the
// client once, copying the PM. A project not active, or a milestone whose
// payment is reconciled (its D3.8 locked), sends nothing. D3.8 is not built
// yet, so until then the reminder always goes. Each reminder's key is its
// record, so it goes once. Returns how many clients this run reminded.
export async function sendInvoiceReminders(
  database: Database,
  options: { transport?: Transport; now?: Date } = {}
): Promise<number> {
  const today = dayOf(options.now ?? new Date())
  const transport = options.transport ?? getTransport()

  const candidates = await database
    .select({
      id: toolRecords.id,
      projectId: toolRecords.projectId,
      cycle: toolRecords.cycle,
      payload: toolRecords.payload,
      projectStatus: projects.status,
    })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(
      and(
        eq(toolRecords.toolId, TRANSMITTED_INVOICE),
        eq(toolRecords.state, "locked")
      )
    )

  let reminded = 0

  for (const record of candidates) {
    const values = savedOf(record.payload)

    const day =
      values.dateSent && reminderDayOf(values.dateSent, values.paymentDueDate)

    if (
      record.projectStatus !== "active" ||
      values.reminderScheduled !== YES ||
      !values.sentTo ||
      !day ||
      day > today ||
      (await reconciled(database, record.projectId, record.cycle))
    ) {
      continue
    }

    const key = `invoice_reminder:${record.id}`

    const [already] = await database
      .select({ id: emailLog.id })
      .from(emailLog)
      .where(and(eq(emailLog.key, key), ne(emailLog.status, "failed")))

    if (already) {
      continue
    }

    const [{ clientName }, draft] = await Promise.all([
      namesOf(database, record.projectId),
      cyclePayload(database, record.projectId, DRAFT_INVOICE, record.cycle),
    ])

    const total = amount.parse(draft.totalAmountDue)

    const sent = await sendEmail(
      database,
      {
        to: values.sentTo,
        cc: values.ccBcc ? [values.ccBcc] : [],
        kind: "invoice_reminder",
        data: {
          subject: values.subject ?? "",
          clientName,
          invoiceNumber: text.parse(draft.invoiceNumber),
          amount: total === undefined ? "" : ghs(total),
          dueDate: shownDay(values.paymentDueDate!),
        },
        projectId: record.projectId,
        recordId: record.id,
        key,
      },
      transport
    )

    if (sent.status === "sent") {
      reminded += 1
    }
  }

  return reminded
}
