import { and, eq } from "drizzle-orm"

import type { Database } from "@/db"
import { toolRecords } from "@/db/schema"
import { OVERDUE_ACCOUNTS, YES } from "@/lib/overdue-account"
import { isCyclePaid } from "@/server/payments/reconciled-submit"
import { workbooks, type Workbook } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

// Kept to light imports: server/permissions/permissions and the record
// screens read it on every write check of a later workbook's tool.

type Reader = Pick<Database, "select">

// The last workbook a halt leaves open: Payments, so Finance can still
// chase and reconcile the money.
const HALT_AFTER: Workbook = "wb03"

// Whether a halt reaches the tool: one in a workbook after Payments.
export function haltReaches(toolId: string): boolean {
  const workbook = tools.getTool(toolId)?.workbook
  const at = workbooks.findIndex((each) => each === workbook)

  return at > workbooks.indexOf(HALT_AFTER)
}

// The milestone cycles whose locked D3.11 halted the project's engineering
// work and whose D3.8 is not approved yet. Empty when work is not halted.
export async function haltingCycles(
  database: Reader,
  projectId: string
): Promise<number[]> {
  const reports = await database
    .select({ cycle: toolRecords.cycle, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, OVERDUE_ACCOUNTS),
        eq(toolRecords.state, "locked")
      )
    )

  const halting: number[] = []

  for (const report of reports) {
    if (
      report.payload.haltWork === YES &&
      !(await isCyclePaid(database, projectId, report.cycle))
    ) {
      halting.push(report.cycle)
    }
  }

  return halting
}

// Work halted: a D3.11 locked with the halt answered Yes, until that
// milestone's D3.8 is approved. The project page shows it.
export async function isWorkHalted(
  database: Reader,
  projectId: string
): Promise<boolean> {
  return (await haltingCycles(database, projectId)).length > 0
}

// Whether the halt makes the tool read only on the project now: no Save,
// Submit, Sign or Approve for anyone. The one place every write check asks.
export async function haltedFor(
  database: Reader,
  projectId: string,
  toolId: string
): Promise<boolean> {
  return haltReaches(toolId) && (await isWorkHalted(database, projectId))
}
