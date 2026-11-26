import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { people, personProjectRoles, projects, toolRecords } from "@/db/schema"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { OVERDUE_ACCOUNTS } from "@/lib/overdue-account"
import { TRANSMITTED_INVOICE, shownDay } from "@/lib/transmitted-invoice"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { toolPath } from "@/server/notifications/raise"
import { notify } from "@/server/notifications/notifications"
import { cycleRecord } from "@/server/payments/approved-invoice"
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

// The daily overdue check, run with the hourly follow-ups: every milestone
// whose sent invoice (D3.6) fell due before today, on an active project,
// whose D3.8 is not approved and that has no D3.11 yet, gets one, opened by
// the app. The project's FO and PM are told in the app and by email. The
// unique record per cycle keeps it to one, even when two runs overlap.
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
      (await cycleRecord(
        database,
        invoice.projectId,
        OVERDUE_ACCOUNTS,
        invoice.cycle
      )) ||
      (await isCyclePaid(database, invoice.projectId, invoice.cycle))
    ) {
      continue
    }

    let record: { id: string }

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

    const [trigger, told] = await Promise.all([
      cyclePayload(database, invoice.projectId, BILLING_TRIGGER, invoice.cycle),
      toldOf(database, invoice.projectId),
    ])

    const milestone = text.parse(trigger.milestone)
    const path = `${toolPath(invoice.projectId, OVERDUE_ACCOUNTS)}?cycle=${invoice.cycle}`

    await database.transaction((transaction) =>
      notify(transaction, {
        personIds: told.map((person) => person.id),
        kind: "tool_open",
        title: `${OVERDUE_ACCOUNTS} is open: payment overdue`,
        text: `Overdue Accounts Report for ${milestone || "the milestone"} on ${invoice.projectName}, due ${shownDay(due)}`,
        projectId: invoice.projectId,
        recordId: record.id,
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
          recordId: record.id,
          key: `payment_overdue:${record.id}:${person.id}`,
        },
        transport
      )
    }
  }

  return opened
}
