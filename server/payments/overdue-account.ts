import { and, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  notifications,
  people,
  personProjectRoles,
  projects,
  toolRecords,
} from "@/db/schema"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { OVERDUE_ACCOUNTS } from "@/lib/overdue-account"
import { TRANSMITTED_INVOICE, shownDay } from "@/lib/transmitted-invoice"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { toolPath } from "@/server/notifications/raise"
import { notify } from "@/server/notifications/notifications"
import { cyclePayload } from "@/server/payments/draft-invoice"
import { isCyclePaid } from "@/server/payments/reconciled-submit"
import { ToolNotAvailableError, createRecord } from "@/server/records/records"
import { systemActor } from "@/server/system/system"

const text = z.string().catch("")

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

function linkOf(path: string) {
  return `${requireEnv("BETTER_AUTH_URL").replace(/\/+$/, "")}${path}`
}

// The FO and PM of the project, each once, who are told D3.11 is open.
async function toldOf(database: Database, projectId: string) {
  return database
    .selectDistinct({ id: people.id, email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        inArray(personProjectRoles.role, ["FO", "PM"])
      )
    )
}

// The cycle's D3.11, never a voided one.
async function reportOf(database: Database, projectId: string, cycle: number) {
  const [report] = await database
    .select({ id: toolRecords.id, state: toolRecords.state })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, OVERDUE_ACCOUNTS),
        eq(toolRecords.cycle, cycle),
        ne(toolRecords.state, "void")
      )
    )
    .limit(1)

  return report
}

// The daily overdue check, run with the hourly follow-ups: every milestone
// whose sent invoice (D3.6) fell due before today, on an active project,
// whose D3.8 is not approved and that has no D3.11 yet, gets one, opened by
// the app. The project's FO and PM are told in the app and by email; while
// the report is still a draft, a later run tells anyone a failed delivery
// missed, each email keyed to its report and person, so none goes twice.
// The unique record per cycle keeps it to one, even when two runs overlap.
// Returns how many reports this run opened.
export async function openOverdueReports(
  database: Database,
  options: { transport?: Transport; now?: Date } = {}
): Promise<number> {
  const today = dayOf(options.now ?? new Date())
  const transport = options.transport ?? getTransport()

  const sent = await database
    .select({
      projectId: toolRecords.projectId,
      cycle: toolRecords.cycle,
      payload: toolRecords.payload,
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

  let opened = 0

  for (const invoice of sent) {
    const due = text.parse(invoice.payload.paymentDueDate)

    if (
      !due ||
      due >= today ||
      (await isCyclePaid(database, invoice.projectId, invoice.cycle))
    ) {
      continue
    }

    const existing = await reportOf(database, invoice.projectId, invoice.cycle)

    // A report the FO has started on was told already; one still a draft
    // may have had a delivery fail, so it is told again where it was not.
    if (existing && existing.state !== "draft") {
      continue
    }

    let record = existing

    if (!record) {
      try {
        record = await createRecord(database, systemActor, {
          projectId: invoice.projectId,
          toolId: OVERDUE_ACCOUNTS,
          cycle: invoice.cycle,
          byJob: true,
        })
      } catch (error) {
        // Not open on this project, or another run opened it first.
        if (error instanceof ToolNotAvailableError) {
          continue
        }

        throw error
      }

      opened += 1
    }

    const reportId = record.id

    const [trigger, told] = await Promise.all([
      cyclePayload(database, invoice.projectId, BILLING_TRIGGER, invoice.cycle),
      toldOf(database, invoice.projectId),
    ])

    const milestone = text.parse(trigger.milestone)
    const path = `${toolPath(invoice.projectId, OVERDUE_ACCOUNTS)}?cycle=${invoice.cycle}`

    const notified = new Set(
      (
        await database
          .select({ personId: notifications.personId })
          .from(notifications)
          .where(
            and(
              eq(notifications.recordId, reportId),
              eq(notifications.kind, "tool_open")
            )
          )
      ).map((row) => row.personId)
    )

    await database.transaction((transaction) =>
      notify(transaction, {
        personIds: told
          .map((person) => person.id)
          .filter((id) => !notified.has(id)),
        kind: "tool_open",
        title: `${OVERDUE_ACCOUNTS} is open: payment overdue`,
        text: `Overdue Accounts Report for ${milestone || "the milestone"} on ${invoice.projectName}, due ${shownDay(due)}`,
        projectId: invoice.projectId,
        recordId: reportId,
        path,
      })
    )

    for (const person of told) {
      await sendEmail(
        database,
        {
          to: person.email,
          kind: "payment_overdue",
          data: {
            projectName: invoice.projectName,
            milestone,
            dueDate: shownDay(due),
            link: linkOf(path),
          },
          projectId: invoice.projectId,
          recordId: reportId,
          key: `payment_overdue:${reportId}:${person.id}`,
        },
        transport
      )
    }
  }

  return opened
}
