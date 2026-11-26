import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { toolRecords, type RecordState } from "@/db/schema"
import { repeatsPerCycle, type ToolStatus } from "@/server/workflow/workflow"

import { selectsFromTables } from "./options-from"

// One cycle of a tool run once per payment milestone, named by what it is
// for, such as "2.2 Fabrication Milestone (Design Approval)".
export type CycleEntry = {
  cycle: number
  label: string
  state: Exclude<RecordState, "void"> | "notStarted"
}

const text = z.string().catch("")

// Each cycle's record of a repeating tool, oldest first, named by the pick
// of its first select read from another tool's table, such as D3.3's
// milestone, or "Cycle 2" before one is picked; then the next cycle, while
// the workflow has it open.
export async function cyclesOf(
  database: Pick<Database, "select">,
  projectId: string,
  toolId: string,
  status: Pick<ToolStatus, "cycle" | "missing">
): Promise<CycleEntry[]> {
  if (!repeatsPerCycle(toolId)) {
    return []
  }

  const naming = selectsFromTables(toolId)[0]?.key

  const records = await database
    .select({
      cycle: toolRecords.cycle,
      state: toolRecords.state,
      payload: toolRecords.payload,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(toolRecords.cycle)

  const entries: CycleEntry[] = records.map((record) => ({
    cycle: record.cycle,
    label:
      (naming ? text.parse(record.payload[naming]) : "") ||
      `Cycle ${record.cycle}`,
    state: record.state === "void" ? "notStarted" : record.state,
  }))

  // The next cycle may have been started since the status was read, so it
  // is added only while nothing holds it yet.
  const started = entries.some((entry) => entry.cycle >= status.cycle)

  return status.missing.length === 0 && !started
    ? [
        ...entries,
        { cycle: status.cycle, label: "Next milestone", state: "notStarted" },
      ]
    : entries
}
