import { and, eq, gte, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  emailLog,
  notifications,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import {
  BANK_STATEMENT_LOG,
  REMINDER_HOUR,
  accountChecked,
  isWorkingDay,
  varianceOf,
} from "@/lib/bank-statement-log"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import type { Fills } from "@/lib/placeholders"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import type { Transaction } from "@/server/audit/audit"
import { namesOf } from "@/server/contract/transmittal"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { toolPath } from "@/server/notifications/raise"
import { notify } from "@/server/notifications/notifications"
import { cycleRecord } from "@/server/payments/approved-invoice"
import { cyclePayload } from "@/server/payments/draft-invoice"
import type { RecordState } from "@/db/schema"
import type { FieldError } from "@/server/records/validate"

type Reader = Pick<Transaction, "select">

const text = z.string().catch("")

const amount = z.number().optional().catch(undefined)

const signed = z
  .object({
    foSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// The cycle's TOTAL AMOUNT DUE, from its locked D3.4: the amount D3.6 sent.
async function expectedOf(database: Reader, projectId: string, cycle: number) {
  const draft = await cycleRecord(database, projectId, DRAFT_INVOICE, cycle)

  return draft?.state === "locked"
    ? amount.parse(draft.payload.totalAmountDue)
    : undefined
}

// What the system fills into D3.7, read live: the request ID always; while
// the check is open, the account checked, the invoice's total and the day
// the FO signed. A locked check keeps what it was submitted with.
export async function bankLogValues(
  database: Reader,
  projectId: string,
  record: { state: RecordState | "notStarted"; payload: JsonObject },
  cycle: number
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const requestId = project?.requestId ?? ""

  if (record.state === "locked") {
    return { requestId }
  }

  const expected = await expectedOf(database, projectId, cycle)
  const signedAt = signed.parse(record.payload).foSignature?.signedAt

  return {
    requestId,
    accountChecked: accountChecked(),
    ...(expected !== undefined && { expectedAmount: expected }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

// What the app fills into D3.7's labels: the client's name, as in "Were any
// funds deposited by Asante Mills in the last 24 hours?".
export async function bankLogFills(
  database: Reader,
  projectId: string
): Promise<Fills> {
  const { clientName } = await namesOf(database, projectId)

  return { "Client Name": clientName }
}

// What submitting a check stores: the account checked, the invoice's total
// and the variance, so the locked check keeps what the FO saw, and the
// submit rules read the variance (3.0 Yes only at 0.00).
export async function bankLogOnSubmit(
  database: Reader,
  projectId: string,
  cycle: number,
  payload: JsonObject
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  const expected = await expectedOf(database, projectId, cycle)

  const variance = varianceOf({
    ...payload,
    ...(expected !== undefined && { expectedAmount: expected }),
  })

  return {
    values: {
      accountChecked: accountChecked(),
      ...(expected !== undefined && { expectedAmount: expected }),
      ...(variance !== undefined && { variance }),
    },
    errors: [],
  }
}

function linkOf(path: string) {
  return `${requireEnv("BETTER_AUTH_URL").replace(/\/+$/, "")}${path}`
}

// The FO's reminder, run every hour: from 9:00 on each working day, every
// milestone whose invoice D3.6 sent and whose D3.7 has not proceeded, on an
// active project, reminds the project's Finance Officers, in the app and by
// email, once that day. The day D3.6 was sent, and a day a check was already
// submitted, send nothing. Proceed locks D3.7 for good, which stops it.
// Returns how many reminder emails this run sent.
export async function sendBankCheckReminders(
  database: Database,
  options: { transport?: Transport; now?: Date } = {}
): Promise<number> {
  const now = options.now ?? new Date()
  const today = dayOf(now)

  if (!isWorkingDay(today) || now.getUTCHours() < REMINDER_HOUR) {
    return 0
  }

  const transport = options.transport ?? getTransport()
  const startOfDay = new Date(`${today}T00:00:00Z`)

  const sent = await database
    .select({
      projectId: toolRecords.projectId,
      cycle: toolRecords.cycle,
      lockedAt: toolRecords.lockedAt,
      projectName: projects.name,
    })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(
      and(
        eq(toolRecords.toolId, TRANSMITTED_INVOICE),
        eq(toolRecords.state, "locked"),
        eq(projects.status, "active")
      )
    )

  let reminded = 0

  for (const invoice of sent) {
    if (!invoice.lockedAt || dayOf(invoice.lockedAt) >= today) {
      continue
    }

    const check = await cycleRecord(
      database,
      invoice.projectId,
      BANK_STATEMENT_LOG,
      invoice.cycle
    )

    if (
      check?.state === "locked" ||
      (check?.lockedAt && dayOf(check.lockedAt) === today)
    ) {
      continue
    }

    const [trigger, officers] = await Promise.all([
      cyclePayload(database, invoice.projectId, BILLING_TRIGGER, invoice.cycle),
      database
        .selectDistinct({ id: people.id, email: people.email })
        .from(personProjectRoles)
        .innerJoin(people, eq(people.id, personProjectRoles.personId))
        .where(
          and(
            eq(personProjectRoles.projectId, invoice.projectId),
            eq(personProjectRoles.role, "FO")
          )
        ),
    ])

    const milestone = text.parse(trigger.milestone)
    const path = `${toolPath(invoice.projectId, BANK_STATEMENT_LOG)}?cycle=${invoice.cycle}`

    for (const officer of officers) {
      await database.transaction(async (transaction) => {
        const [told] = await transaction
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.personId, officer.id),
              eq(notifications.kind, "bank_check_due"),
              eq(notifications.path, path),
              gte(notifications.createdAt, startOfDay)
            )
          )
          .limit(1)

        if (!told) {
          await notify(transaction, {
            personIds: [officer.id],
            kind: "bank_check_due",
            title: "Check the bank for the milestone payment",
            text: `${BANK_STATEMENT_LOG} Daily Bank Statement Log for ${milestone || "the milestone"} on ${invoice.projectName}`,
            projectId: invoice.projectId,
            path,
          })
        }
      })

      const key = `bank_check_reminder:${invoice.projectId}:${invoice.cycle}:${officer.id}:${today}`

      const [already] = await database
        .select({ id: emailLog.id })
        .from(emailLog)
        .where(and(eq(emailLog.key, key), ne(emailLog.status, "failed")))

      if (already) {
        continue
      }

      const result = await sendEmail(
        database,
        {
          to: officer.email,
          kind: "bank_check_reminder",
          data: {
            projectName: invoice.projectName,
            milestone,
            link: linkOf(path),
          },
          projectId: invoice.projectId,
          key,
        },
        transport
      )

      if (result.status === "sent") {
        reminded += 1
      }
    }
  }

  return reminded
}
