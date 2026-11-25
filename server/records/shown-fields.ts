import type { Database } from "@/db"
import type { JsonObject } from "@/db/schema"
import { rolesOn } from "@/server/permissions/permissions"
import type { ToolDefinition } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

type Reader = Pick<Database, "select">

// Whether this person reads the project as its client: every role they hold
// on it is Client. Someone who also holds a staff role reads it as staff.
export async function readsAsClient(
  database: Reader,
  actor: string,
  projectId: string
): Promise<boolean> {
  const held = await rolesOn(database, actor, projectId)

  return held.length > 0 && held.every((role) => role === "Client")
}

// The tool as one reader's form and PDF show it: never the fields the system
// keeps for its own steps, and for the client, none of IMHOGEN's own fields
// (`internalOnly`).
export function toolAsShown(
  tool: ToolDefinition,
  reader: { client: boolean }
): ToolDefinition {
  const fields = tool.fields.filter(
    (field) => !field.hidden && !(reader.client && field.internalOnly)
  )

  return fields.length === tool.fields.length ? tool : { ...tool, fields }
}

function internalKeys(toolId: string): Set<string> {
  return new Set(
    (tools.getTool(toolId)?.fields ?? [])
      .filter((field) => field.internalOnly)
      .map((field) => field.key)
  )
}

// Whether the tool has any field the client never gets.
export function hasInternalFields(toolId: string): boolean {
  return internalKeys(toolId).size > 0
}

// The payload without the values of the tool's fields the client never gets.
export function withoutInternalValues(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const internal = internalKeys(toolId)

  if (internal.size === 0) {
    return payload
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !internal.has(key))
  )
}
