import { eq } from "drizzle-orm"

import { projects } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { lockedPayload } from "@/server/handoff/handoff"
import { shownTool } from "@/server/pdf/preview-source"
import { tools } from "@/server/tools/registry"

type Reader = Pick<Transaction, "select">

// The fixed rows of each of the tool's tables that this project does not
// need (`notNeeded`), by table key: those whose rule's tool is locked on the
// project with the answer named, such as D2.13's negotiation notes when D2.7
// was locked with Accepted as-is.
export async function rowsNotNeeded(
  database: Reader,
  projectId: string,
  toolId: string
): Promise<Map<string, Set<number>>> {
  const rules = (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    field.type === "table" && field.notNeeded
      ? field.notNeeded.map((rule) => ({ table: field.key, ...rule }))
      : []
  )

  const skipped = new Map<string, Set<number>>()

  if (rules.length === 0) {
    return skipped
  }

  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  for (const rule of rules) {
    const shown = project ? shownTool(rule.when.tool, project.track) : undefined

    const answer = shown
      ? (await lockedPayload(database, projectId, shown))[rule.when.field]
      : undefined

    if (answer === rule.when.is) {
      const rows = skipped.get(rule.table) ?? new Set<number>()

      rows.add(rule.row)
      skipped.set(rule.table, rows)
    }
  }

  return skipped
}
