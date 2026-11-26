import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import {
  BANK_TRANSFER,
  PAYMENT_RECEIPT,
  YES,
  paymentMethods,
  receiptFileName,
  receiptScriptFor,
  receiptSubjectFor,
  sentReceiptEmailPath,
} from "@/lib/payment-receipt"
import { RECONCILED_PAYMENT, YES as FUNDS_YES } from "@/lib/reconciled-payment"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import {
  EmailRefusedError,
  SendNotReadyError,
} from "@/server/acknowledgement/acknowledgement"
import type { Transaction } from "@/server/audit/audit"
import { namesOf } from "@/server/contract/transmittal"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { cycleRecord } from "@/server/payments/approved-invoice"
import { cycleMilestone } from "@/server/payments/draft-invoice"
import { receiptPdf } from "@/server/pdf/receipt-pdf"
import {
  PermissionDeniedError,
  assertCan,
  can,
} from "@/server/permissions/permissions"
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

// The parts of a saved D3.9 that sending and the receipt read.
const saved = z.object({
  receiptNumber: z.string().optional().catch(undefined),
  dateIssued: z.string().optional().catch(undefined),
  timeSent: z.string().optional().catch(undefined),
  receivedFrom: z.string().optional().catch(undefined),
  paymentMethod: z.string().optional().catch(undefined),
  amountReceived: z.number().optional().catch(undefined),
  script: z.string().optional().catch(undefined),
})

function savedOf(payload: JsonObject) {
  return saved.parse(payload)
}

// The day and the time in Ghana, which keeps UTC.
function timeOf(at: Date) {
  const iso = at.toISOString()

  return { dateIssued: iso.slice(0, 10), timeSent: iso.slice(11, 16) }
}

// What cleared in the bank for the milestone: the Actual Amount Cleared of
// its approved D3.8, the newest iteration, once it is approved with the funds
// fully accounted for. Undefined until then.
async function reconciledAmount(
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

  return record?.state === "locked" &&
    record.payload.fundsAccounted === FUNDS_YES
    ? amount.parse(record.payload.actualCleared)
    : undefined
}

// The cycle's invoice number, from its locked D3.4, or "" until it locks.
async function invoiceNumberOf(
  database: Reader,
  projectId: string,
  cycle: number
) {
  const draft = await cycleRecord(database, projectId, DRAFT_INVOICE, cycle)

  return draft?.state === "locked"
    ? text.parse(draft.payload.invoiceNumber)
    : ""
}

// Where the receipt goes: the client billing email the cycle's invoice was
// sent to at D3.6, or "" until it is sent.
async function billingEmailOf(
  database: Reader,
  projectId: string,
  cycle: number
) {
  const sent = await cycleRecord(
    database,
    projectId,
    TRANSMITTED_INVOICE,
    cycle
  )

  return sent?.state === "locked" ? text.parse(sent.payload.sentTo).trim() : ""
}

// The email of the project's PM, whom the receipt email copies, or "" when
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

// What the receipt says of the milestone before it is sent, read live: who
// paid, how much cleared and which invoice it paid.
async function factsOf(database: Reader, projectId: string, cycle: number) {
  const [{ clientName, projectName }, received, invoiceNumber] =
    await Promise.all([
      namesOf(database, projectId),
      reconciledAmount(database, projectId, cycle),
      invoiceNumberOf(database, projectId, cycle),
    ])

  return { clientName, projectName, received, invoiceNumber }
}

// Where a cycle's D3.9 starts before the FO saves anything: Bank Transfer,
// and the sheet's covering message with the client, the amount received and
// the invoice number filled in. The FO can change both until it is sent.
export async function paymentReceiptStart(
  database: Reader,
  projectId: string,
  cycle: number
): Promise<JsonObject> {
  const facts = await factsOf(database, projectId, cycle)

  return {
    paymentMethod: BANK_TRANSFER,
    script: receiptScriptFor({
      clientName: facts.clientName,
      amount: facts.received === undefined ? undefined : ghs(facts.received),
      invoiceNumber: facts.invoiceNumber,
    }),
  }
}

// What the system fills into D3.9, read live: the request ID always; until
// the receipt is sent, the client's name and D3.8's amount cleared. Once
// sent, what went out is stored and shown instead.
export async function paymentReceiptValues(
  database: Reader,
  projectId: string,
  payload: JsonObject,
  cycle: number
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const requestId = project?.requestId ?? ""

  if (savedOf(payload).dateIssued) {
    return { requestId }
  }

  const facts = await factsOf(database, projectId, cycle)

  return {
    requestId,
    receivedFrom: facts.clientName,
    ...(facts.received !== undefined && { amountReceived: facts.received }),
  }
}

// What still stops D3.9 being sent, in the words the Send button shows.
export function missingToSend(payload: JsonObject): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!values.paymentMethod || !paymentMethods.includes(values.paymentMethod)) {
    missing.push("the payment method")
  }

  if (!values.script?.trim()) {
    missing.push("the covering message")
  }

  if (!values.receiptNumber) {
    missing.push("the receipt number")
  }

  return missing
}

// The receipt the client receives for one milestone, as its D3.9 holds it.
export type Receipt = {
  fileName: string
  receiptNumber: string
  dateIssued: string
  clientName: string
  projectName: string
  invoiceNumber: string
  milestone: string
  amountReceived: number
  paymentMethod: string
}

export class ReceiptNotFoundError extends Error {}

// The receipt made from a D3.9's values once they are filled in for
// sending, with the cycle's invoice and milestone, which are locked by then.
async function receiptFrom(
  database: Reader,
  projectId: string,
  cycle: number,
  payload: JsonObject
): Promise<Receipt> {
  const values = savedOf(payload)

  const [[project], invoiceNumber, milestone] = await Promise.all([
    database
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId)),
    invoiceNumberOf(database, projectId, cycle),
    cycleMilestone(database, projectId, cycle),
  ])

  const receiptNumber = values.receiptNumber ?? ""
  const clientName = values.receivedFrom ?? ""

  return {
    fileName: receiptFileName(receiptNumber, clientName),
    receiptNumber,
    dateIssued: values.dateIssued ?? "",
    clientName,
    projectName: project?.name ?? "",
    invoiceNumber,
    milestone: milestone?.milestone ?? "",
    amountReceived: values.amountReceived ?? 0,
    paymentMethod: values.paymentMethod ?? "",
  }
}

// The receipt of a milestone cycle, for someone who may read D3.9: made from
// the cycle's D3.9 once it is sent, which locks it, each time it is asked
// for, so it can never differ from what the client received.
export async function paymentReceipt(
  database: Reader,
  personId: string,
  projectId: string,
  cycle: number
): Promise<Receipt> {
  if (!(await can(database, personId, projectId, PAYMENT_RECEIPT, "read"))) {
    throw new PermissionDeniedError(
      `Not allowed to read ${PAYMENT_RECEIPT} on this project`
    )
  }

  const record = await cycleRecord(database, projectId, PAYMENT_RECEIPT, cycle)

  if (record?.state !== "locked") {
    throw new ReceiptNotFoundError(
      `Cycle ${cycle} of this project has no receipt sent`
    )
  }

  return receiptFrom(database, projectId, cycle, record.payload)
}

// The cycle's receipt for the D3.9 page, or null until it is sent.
export async function shownReceipt(
  database: Reader,
  personId: string,
  projectId: string,
  cycle: number
): Promise<Receipt | null> {
  try {
    return await paymentReceipt(database, personId, projectId, cycle)
  } catch (error) {
    if (error instanceof ReceiptNotFoundError) {
      return null
    }

    throw error
  }
}

async function loadReceipt(database: Reader, recordId: string) {
  const [record] = await database
    .select({
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      cycle: toolRecords.cycle,
    })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== PAYMENT_RECEIPT) {
    throw new RecordNotFoundError(`No ${PAYMENT_RECEIPT} record ${recordId}`)
  }

  return record
}

// A draft D3.9, not yet locked by a send, held for this transaction.
async function draftToSend(
  transaction: Transaction,
  recordId: string
): Promise<ToolRecord> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(
      current.state === "locked"
        ? "This receipt has already been sent"
        : `A ${current.state} record cannot be sent`
    )
  }

  return current
}

// The FO's Send on D3.9: emails the receipt PDF to the client billing email
// the cycle's invoice went to, copying the PM, with the subject and the
// covering message, and keeps a copy of the email. Date Issued, Time Sent,
// who paid and the amount are filled in before the email goes, which freezes
// the payment method and the message, so an edit saved meanwhile cannot make
// the record differ from the email. Once it has gone, 3.0 is filled in and
// D3.9 locks, which opens D3.10 for the milestone once it is built. The
// record's ID is the email's key, so pressing twice sends one email; when
// the email service refuses it, what was filled in is cleared again and the
// FO can send again. A send cut short after it was prepared is finished by
// pressing Send again.
export async function sendPaymentReceipt(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const { projectId, cycle } = await loadReceipt(database, recordId)

  await assertCan(database, actor, projectId, PAYMENT_RECEIPT, "write")

  const now = options.now ?? new Date()

  const [to, pm, facts] = await Promise.all([
    billingEmailOf(database, projectId, cycle),
    pmEmailOf(database, projectId),
    factsOf(database, projectId, cycle),
  ])

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const current = await draftToSend(transaction, recordId)

    // A send already prepared, whose email went or was cut short before it
    // was recorded, is finished with what was saved: the email's key finds
    // the email already sent, so it never goes twice.
    if (savedOf(current.payload).dateIssued) {
      return current.payload
    }

    const missing = missingToSend(current.payload)

    if (!to) {
      missing.push("the client billing email this milestone's invoice went to")
    }

    if (facts.received === undefined) {
      missing.push("this milestone's reconciled payment (D3.8)")
    }

    if (missing.length > 0) {
      throw new SendNotReadyError(missing)
    }

    const filled = await setSystemValues(
      transaction,
      actor,
      recordId,
      {
        ...timeOf(now),
        receivedFrom: facts.clientName,
        amountReceived: facts.received ?? null,
      },
      "Sending the receipt to the client",
      "draft"
    )

    return filled.payload
  })

  const receipt = await receiptFrom(database, projectId, cycle, prepared)

  const sent = await deliver(database, {
    projectId,
    recordId,
    receipt,
    to,
    cc: pm ? [pm] : [],
    subject: receiptSubjectFor(receipt.receiptNumber, receipt.projectName),
    script: savedOf(prepared).script ?? "",
    transport: options.transport,
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
          {
            dateIssued: null,
            timeSent: null,
            receivedFrom: null,
            amountReceived: null,
          },
          "The email service refused the receipt",
          "draft"
        )
      )
    }

    throw new EmailRefusedError(
      sent.status === "failed"
        ? `The email service did not send it: ${sent.error ?? "no reason given"}. Press Send to try again.`
        : "This receipt is already being sent. Reload the page in a moment."
    )
  }

  return database.transaction((transaction) =>
    lockDraftIn(transaction, actor, recordId, {
      receiptAttached: YES,
      sentEmailLink: sentReceiptEmailPath(projectId, cycle),
    })
  )
}

// The email itself, with the receipt's PDF. Anything that stops it before
// the email service answers counts as refused.
async function deliver(
  database: Database,
  input: {
    projectId: string
    recordId: string
    receipt: Receipt
    to: string
    cc: string[]
    subject: string
    script: string
    transport: Transport | undefined
  }
) {
  try {
    const pdf = await receiptPdf(input.receipt)

    return await sendEmail(
      database,
      {
        to: input.to,
        cc: input.cc,
        kind: "receipt_transmittal",
        data: {
          subject: input.subject,
          body: input.script,
          attachment: {
            filename: input.receipt.fileName,
            content: pdf.content.toString("base64"),
          },
        },
        projectId: input.projectId,
        recordId: input.recordId,
        key: `receipt_transmittal:${input.recordId}`,
        keepCopy: true,
      },
      input.transport ?? getTransport()
    )
  } catch (error) {
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    }
  }
}
