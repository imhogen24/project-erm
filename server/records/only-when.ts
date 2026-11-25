import { and, eq } from "drizzle-orm"

import { toolRecords } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import type { ToolDefinition } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

type Reader = Pick<Transaction, "select">

// The tool's fields this project does not ask for: each `onlyWhen` field
// whose tool has no locked record on the project, such as D2.10's financial
// re-check on a contract nobody negotiated.
export async function fieldsOff(
  database: Reader,
  projectId: string,
  toolId: string
): Promise<Set<string>> {
  const off = new Set<string>()
  const locked = new Map<string, boolean>()

  for (const field of tools.getTool(toolId)?.fields ?? []) {
    const needs = field.onlyWhen?.locked

    if (!needs) {
      continue
    }

    if (!locked.has(needs)) {
      const [record] = await database
        .select({ id: toolRecords.id })
        .from(toolRecords)
        .where(
          and(
            eq(toolRecords.projectId, projectId),
            eq(toolRecords.toolId, needs),
            eq(toolRecords.state, "locked")
          )
        )
        .limit(1)

      locked.set(needs, Boolean(record))
    }

    if (!locked.get(needs)) {
      off.add(field.key)
    }
  }

  return off
}

// The tool without the fields this project does not ask for.
export function withoutFieldsOff(
  tool: ToolDefinition,
  off: ReadonlySet<string>
): ToolDefinition {
  return off.size === 0
    ? tool
    : { ...tool, fields: tool.fields.filter((field) => !off.has(field.key)) }
}
