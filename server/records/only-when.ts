import { and, eq } from "drizzle-orm"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import type { ToolDefinition } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { shownFor } from "./signatures"

type Reader = Pick<Transaction, "select">

// The tool's fields this record does not ask for: each `onlyWhen` field
// whose tool has no locked record on the project, such as D2.10's financial
// re-check on a contract nobody negotiated, or whose answer the record does
// not hold, such as D2.11's signatures sent by courier.
export async function fieldsOff(
  database: Reader,
  projectId: string,
  toolId: string,
  payload: JsonObject
): Promise<Set<string>> {
  const off = new Set<string>()
  const locked = new Map<string, boolean>()

  for (const field of tools.getTool(toolId)?.fields ?? []) {
    const when = field.onlyWhen

    if (!when) {
      continue
    }

    if (!("locked" in when)) {
      if (!shownFor(field, payload)) {
        off.add(field.key)
      }

      continue
    }

    const needs = when.locked

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
