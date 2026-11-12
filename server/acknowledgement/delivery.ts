import { and, count, desc, eq, isNotNull, isNull, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  emailLog,
  personProjectRoles,
  projects,
  toolRecords,
} from "@/db/schema"
import { writeAudit, type Transaction } from "@/server/audit/audit"
import {
  getTransport,
  sendEmail,
  type Delivery,
  type DeliveryLookup,
  type EmailLogRow,
  type Transport,
} from "@/server/email/email"
import {
  notify,
  type NotificationKind,
} from "@/server/notifications/notifications"
import { assertCan } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotFoundError,
  ValidationError,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"
import { systemActor } from "@/server/system/system"

import {
  ACKNOWLEDGEMENT,
  EmailRefusedError,
  SENT,
  acknowledgementDraft,
  copiedAddresses,
  sendableOf,
} from "./acknowledgement"

// D1.4's delivery statuses, the options of its deliveryStatus field
// (workbooks/wb01/tools/d1-4.ts; a test keeps them the same).
export const deliveryStatuses = [SENT, "Delivered", "Bounced"] as const

export type DeliveryStatus = (typeof deliveryStatuses)[number]

// How long the check waits for a final answer before it stops and tells the
// PM that delivery could not be confirmed.
export const CONFIRM_WITHIN_HOURS = 72

const confirmWithin = CONFIRM_WITHIN_HOURS * 60 * 60 * 1000

// Retry is only for an email that bounced or could not be confirmed.
export class RetryNotAllowedError extends Error {}

export type DeliverySummary = {
  delivered: number
  bounced: number
  waiting: number
  unconfirmed: number
  unreachable: number
}

type Checked = Pick<
  EmailLogRow,
  "id" | "projectId" | "recordId" | "messageId" | "createdAt"
>

function pathTo(projectId: string) {
  return `/projects/${projectId}/tools/${ACKNOWLEDGEMENT}`
}

async function projectManagers(transaction: Transaction, projectId: string) {
  const rows = await transaction
    .select({ personId: personProjectRoles.personId })
    .from(personProjectRoles)
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "PM")
      )
    )

  return rows.map((row) => row.personId)
}

// Tells the project's PMs about D1.4's email. A project with no PM tells
// nobody. No client details go in the notice.
async function tellPm(
  transaction: Transaction,
  email: Checked,
  notice: { kind: NotificationKind; title: string; text: string }
) {
  await notify(transaction, {
    ...notice,
    personIds: await projectManagers(transaction, email.projectId!),
    projectId: email.projectId!,
    recordId: email.recordId!,
    path: pathTo(email.projectId!),
  })
}

// Saves a final answer. Only the run that moves the email from sent saves it,
// so a second run, or two at once, changes nothing and notifies nobody.
async function settle(database: Database, email: Checked, answer: Delivery) {
  await database.transaction(async (transaction) => {
    const [moved] = await transaction
      .update(emailLog)
      .set({ status: answer, updatedAt: new Date() })
      .where(and(eq(emailLog.id, email.id), eq(emailLog.status, "sent")))
      .returning({ id: emailLog.id })

    if (!moved) {
      return
    }

    await writeAudit(
      transaction,
      {
        recordId: email.recordId!,
        projectId: email.projectId!,
        actor: systemActor,
        action: "updated",
        reason: "Answer from the email service",
      },
      [{ field: "email.status", oldValue: "sent", newValue: answer }]
    )

    // The log keeps the answer, but D1.4 only takes it while D1.4 is still
    // locked and this is still its newest email: a rollback may have voided
    // it, or a Retry sent a newer one, while the service was being asked.
    const [record] = await transaction
      .select({ state: toolRecords.state })
      .from(toolRecords)
      .where(eq(toolRecords.id, email.recordId!))
      .for("update")

    const latest = await latestEmail(transaction, email.recordId!)

    if (record?.state !== "locked" || latest?.id !== email.id) {
      return
    }

    const status: DeliveryStatus =
      answer === "delivered" ? "Delivered" : "Bounced"

    await setSystemValues(
      transaction,
      systemActor,
      email.recordId!,
      { deliveryStatus: status },
      "Delivery status from the email service"
    )

    if (status === "Bounced") {
      await tellPm(transaction, email, {
        kind: "email_bounced",
        title: "The acknowledgement email bounced",
        text: "Correct the client's address on D1.4 and press Retry.",
      })
    }
  })
}

// Stops checking an email with no answer after the time allowed. It stays at
// sent; the PM is told once and may retry.
async function giveUp(database: Database, email: Checked, now: Date) {
  await database.transaction(async (transaction) => {
    const [stopped] = await transaction
      .update(emailLog)
      .set({ unconfirmedAt: now, updatedAt: now })
      .where(
        and(
          eq(emailLog.id, email.id),
          eq(emailLog.status, "sent"),
          isNull(emailLog.unconfirmedAt)
        )
      )
      .returning({ id: emailLog.id })

    if (!stopped) {
      return
    }

    await writeAudit(
      transaction,
      {
        recordId: email.recordId!,
        projectId: email.projectId!,
        actor: systemActor,
        action: "updated",
        reason: `No answer from the email service after ${CONFIRM_WITHIN_HOURS} hours`,
      },
      [
        {
          field: "email.unconfirmedAt",
          oldValue: null,
          newValue: now.toISOString(),
        },
      ]
    )

    await tellPm(transaction, email, {
      kind: "email_unconfirmed",
      title: "Delivery of the acknowledgement email could not be confirmed",
      text: `There was no answer after ${CONFIRM_WITHIN_HOURS} hours. Check the client's address on D1.4 and press Retry.`,
    })
  })
}

// Asks the email service what became of each D1.4 email still at sent, and
// saves each final answer. It never sends an email. An email the service
// cannot be asked about is left for the next run, even past the time allowed:
// it gives up only on a sent answer, so a late Delivered still counts. An
// email whose D1.4 is no longer locked, such as one voided by a rollback, is
// not checked. The summary holds counts only, so no client detail reaches a
// log.
export async function checkDeliveries(
  database: Database,
  lookup: DeliveryLookup,
  { now = new Date() }: { now?: Date } = {}
): Promise<DeliverySummary> {
  const summary: DeliverySummary = {
    delivered: 0,
    bounced: 0,
    waiting: 0,
    unconfirmed: 0,
    unreachable: 0,
  }

  const pending = await database
    .select({
      id: emailLog.id,
      projectId: emailLog.projectId,
      recordId: emailLog.recordId,
      messageId: emailLog.messageId,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .innerJoin(toolRecords, eq(toolRecords.id, emailLog.recordId))
    .where(
      and(
        eq(toolRecords.state, "locked"),
        eq(emailLog.kind, "acknowledgement"),
        eq(emailLog.status, "sent"),
        isNull(emailLog.unconfirmedAt),
        isNotNull(emailLog.messageId),
        isNotNull(emailLog.recordId),
        isNotNull(emailLog.projectId)
      )
    )

  for (const email of pending) {
    let answer: Delivery

    try {
      answer = await lookup.status(email.messageId!)
    } catch {
      summary.unreachable++
      continue
    }

    if (answer === "sent") {
      if (now.getTime() - email.createdAt.getTime() >= confirmWithin) {
        await giveUp(database, email, now)
        summary.unconfirmed++
      } else {
        summary.waiting++
      }

      continue
    }

    await settle(database, email, answer)
    summary[answer === "delivered" ? "delivered" : "bounced"]++
  }

  return summary
}

// The newest D1.4 email that the service took or is taking. One it refused
// is left out, so Retry can be pressed again on the same key.
async function latestEmail(
  database: Pick<Database, "select">,
  recordId: string
) {
  const [email] = await database
    .select({
      id: emailLog.id,
      recipient: emailLog.recipient,
      status: emailLog.status,
      unconfirmedAt: emailLog.unconfirmedAt,
    })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.recordId, recordId),
        eq(emailLog.kind, "acknowledgement"),
        ne(emailLog.status, "failed")
      )
    )
    .orderBy(desc(emailLog.createdAt), desc(emailLog.id))
    .limit(1)

  return email
}

function mayRetry(email: Awaited<ReturnType<typeof latestEmail>>) {
  if (!email) {
    return false
  }

  return (
    email.status === "bounced" ||
    email.status === "complained" ||
    (email.status === "sent" && email.unconfirmedAt !== null)
  )
}

export type AcknowledgementDelivery = {
  status: DeliveryStatus | null
  // The email bounced, or got no answer in time, so it may be sent again.
  retry: boolean
}

const statusOf = z.enum(deliveryStatuses)

// What D1.4's screen shows of its email. Who may press Retry is the screen's
// own check.
export async function acknowledgementDelivery(
  database: Pick<Database, "select">,
  recordId: string
): Promise<AcknowledgementDelivery> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  const status = statusOf.safeParse(record?.payload.deliveryStatus)

  return {
    status: status.success ? status.data : null,
    retry: mayRetry(await latestEmail(database, recordId)),
  }
}

// D1.4's status for what the email log says of its email.
function statusFor(status: EmailLogRow["status"]): DeliveryStatus {
  if (status === "delivered") {
    return "Delivered"
  }

  return status === "bounced" || status === "complained" ? "Bounced" : SENT
}

// The delivery status of the project's sent D1.4, for its tile on the
// overview, or null before it is sent.
export async function projectDelivery(
  database: Pick<Database, "select">,
  projectId: string
): Promise<DeliveryStatus | null> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, ACKNOWLEDGEMENT),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  const status = statusOf.safeParse(record?.payload.deliveryStatus)

  return status.success ? status.data : null
}

// The PM's Retry on D1.4: the same email, to the corrected address. Its key
// is the email it replaces and the number of retries the service refused, so
// each email is retried once: pressing twice sends once, and of two retries
// at once to different addresses only the first is sent. A refused retry
// keeps its own row and address, and the next press gets a new key. After a spam complaint it is never sent to the same address
// again. D1.4 stays locked; its address, time and status are filled in again
// and logged with who retried.
export async function retryAcknowledgement(
  database: Database,
  actor: string,
  recordId: string,
  sentTo: string,
  transport: Transport = getTransport()
): Promise<ToolRecord> {
  const [record] = await database
    .select({
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      state: toolRecords.state,
      payload: toolRecords.payload,
      projectStatus: projects.status,
    })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== ACKNOWLEDGEMENT) {
    throw new RecordNotFoundError(`No ${ACKNOWLEDGEMENT} record ${recordId}`)
  }

  await assertCan(database, actor, record.projectId, ACKNOWLEDGEMENT, "approve")

  if (record.state !== "locked") {
    throw new InvalidTransitionError("Only a sent email can be retried")
  }

  if (record.projectStatus !== "active") {
    throw new ProjectNotActiveError(
      `This project is ${record.projectStatus.replace("_", " ")}, so nothing can be sent`
    )
  }

  const previous = await latestEmail(database, recordId)

  if (!previous || !mayRetry(previous)) {
    throw new RetryNotAllowedError(
      "Retry is only for an email that bounced or could not be confirmed"
    )
  }

  const address = z.email().safeParse(sentTo.trim())

  if (!address.success) {
    throw new ValidationError([
      { field: "sentTo", message: "Enter the client's email address" },
    ])
  }

  if (
    previous.status === "complained" &&
    previous.recipient.toLowerCase() === address.data.toLowerCase()
  ) {
    throw new ValidationError([
      {
        field: "sentTo",
        message:
          "The client marked this email as spam, so it cannot go to the same address. Enter a different address.",
      },
    ])
  }

  const email = sendableOf(record.payload)
  const cc = copiedAddresses(email.ccBcc)

  const [refused] = await database
    .select({ count: count() })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.recordId, recordId),
        eq(emailLog.kind, "acknowledgement"),
        eq(emailLog.status, "failed")
      )
    )

  const sent = await sendEmail(
    database,
    {
      to: address.data,
      cc,
      kind: "acknowledgement",
      data: { subject: email.subject?.trim() ?? "", body: email.body ?? "" },
      projectId: record.projectId,
      recordId,
      key: `acknowledgement:${recordId}:after:${previous.id}:${refused?.count ?? 0}`,
    },
    transport
  )

  if (sent.status === "failed") {
    throw new EmailRefusedError(
      `The email service did not send it: ${sent.error ?? "no reason given"}. Press Retry to try again.`
    )
  }

  if (sent.status === "queued") {
    throw new EmailRefusedError(
      "This email is already being sent. Reload the page in a moment."
    )
  }

  // Someone else's Retry to another address took this email's one retry.
  if (sent.recipient !== address.data) {
    throw new RetryNotAllowedError(
      "Someone else has just retried this email. Reload the page to see where it went."
    )
  }

  const { sentBy } = await acknowledgementDraft(database, record.projectId)
  const at = sent.updatedAt.toISOString()

  return database.transaction(async (transaction) => {
    // The delivery check may have answered for the new email already. Its
    // row is locked first, as the check locks it, so whichever finishes
    // second sees the other's answer and the record ends with the latest.
    const [now] = await transaction
      .select({ status: emailLog.status })
      .from(emailLog)
      .where(eq(emailLog.id, sent.id))
      .for("update")

    return setSystemValues(
      transaction,
      actor,
      recordId,
      {
        sentTo: address.data,
        ...(sentBy && { sentBy }),
        dateSent: at.slice(0, 10),
        timeSent: at.slice(11, 16),
        deliveryStatus: statusFor(now?.status ?? "sent"),
      },
      "Retried to a corrected address"
    )
  })
}
