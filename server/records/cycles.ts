import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { toolRecords, type JsonObject, type RecordState } from "@/db/schema"
import { tools } from "@/server/tools/registry"
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

// The tool whose pick names a repeating tool's cycles, and the field that
// holds it: the tool's own first select read from another tool's table,
// such as D3.3's milestone, or else the first repeating tool of its
// workbook that has one, such as D3.3's for D3.4.
function namingOf(toolId: string) {
  const own = selectsFromTables(toolId)[0]?.key

  if (own) {
    return { toolId, key: own }
  }

  const workbook = tools.getTool(toolId)?.workbook

  for (const tool of tools.listTools()) {
    const key = selectsFromTables(tool.id)[0]?.key

    if (tool.workbook === workbook && repeatsPerCycle(tool.id) && key) {
      return { toolId: tool.id, key }
    }
  }

  return undefined
}

// The pick that names each cycle of the naming tool, by cycle.
async function namesOf(
  database: Pick<Database, "select">,
  projectId: string,
  naming: { toolId: string; key: string }
): Promise<Map<number, string>> {
  const records = await database
    .select({ cycle: toolRecords.cycle, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, naming.toolId),
        ne(toolRecords.state, "void")
      )
    )

  return new Map(
    records.map((record) => [
      record.cycle,
      text.parse(record.payload[naming.key]),
    ])
  )
}

// Each cycle's record of a repeating tool, oldest first, named by the pick
// that names its cycle (namingOf), such as D3.3's milestone, or "Cycle 2"
// before one is picked; then the next cycle, while the workflow has it
// open.
export async function cyclesOf(
  database: Pick<Database, "select">,
  projectId: string,
  toolId: string,
  status: Pick<ToolStatus, "cycle" | "missing">
): Promise<CycleEntry[]> {
  if (!repeatsPerCycle(toolId)) {
    return []
  }

  const naming = namingOf(toolId)

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

  const names =
    naming && naming.toolId !== toolId
      ? await namesOf(database, projectId, naming)
      : undefined

  const nameOf = (record: { cycle: number; payload: JsonObject }) =>
    names
      ? (names.get(record.cycle) ?? "")
      : naming
        ? text.parse(record.payload[naming.key])
        : ""

  const entries: CycleEntry[] = records.map((record) => ({
    cycle: record.cycle,
    label: nameOf(record) || `Cycle ${record.cycle}`,
    state: record.state === "void" ? "notStarted" : record.state,
  }))

  // The next cycle may have been started since the status was read, so it
  // is added only while nothing holds it yet.
  const started = entries.some((entry) => entry.cycle >= status.cycle)

  return status.missing.length === 0 && !started
    ? [
        ...entries,
        {
          cycle: status.cycle,
          label: names?.get(status.cycle) || "Next milestone",
          state: "notStarted",
        },
      ]
    : entries
}
