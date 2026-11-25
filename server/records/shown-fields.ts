import { z } from "zod"

import type { Database } from "@/db"
import type { JsonObject, JsonValue } from "@/db/schema"
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

type Field = ToolDefinition["fields"][number]

// A table without the columns the client never gets, nor their values in its
// fixed rows. Any other field, or a table with none, is the same field.
function withoutInternalColumns(field: Field): Field {
  if (field.type !== "table") {
    return field
  }

  const hidden = new Set(
    field.columns
      .filter((column) => column.internalOnly)
      .map((column) => column.key)
  )

  if (hidden.size === 0) {
    return field
  }

  return {
    ...field,
    columns: field.columns.filter((column) => !hidden.has(column.key)),
    ...(field.fixedRows && {
      fixedRows: field.fixedRows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => !hidden.has(key))
        )
      ),
    }),
  }
}

// The tool as one reader's form and PDF show it: never the fields the system
// keeps for its own steps, and for the client, none of IMHOGEN's own fields
// or table columns (`internalOnly`).
export function toolAsShown(
  tool: ToolDefinition,
  reader: { client: boolean }
): ToolDefinition {
  const fields = tool.fields
    .filter((field) => !field.hidden && !(reader.client && field.internalOnly))
    .map((field) => (reader.client ? withoutInternalColumns(field) : field))

  const same =
    fields.length === tool.fields.length &&
    fields.every((field, index) => field === tool.fields[index])

  return same ? tool : { ...tool, fields }
}

// The tool's fields the client never gets, and for each table, the columns
// the client never gets.
function internalParts(toolId: string) {
  const fields = new Set<string>()
  const columns = new Map<string, Set<string>>()

  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.internalOnly) {
      fields.add(field.key)
    } else if (field.type === "table") {
      const hidden = field.columns.filter((column) => column.internalOnly)

      if (hidden.length > 0) {
        columns.set(field.key, new Set(hidden.map((column) => column.key)))
      }
    }
  }

  return { fields, columns }
}

// Whether the tool has any field or table column the client never gets.
export function hasInternalFields(toolId: string): boolean {
  const { fields, columns } = internalParts(toolId)

  return fields.size > 0 || columns.size > 0
}

const row = z.record(z.string(), z.unknown())

// One table row without the columns the client never gets.
function withoutColumns(value: JsonValue, hidden: Set<string>): JsonValue {
  if (!row.safeParse(value).success) {
    return value
  }

  // SAFETY: a row that parsed as a record is a JsonObject.
  const cells = value as JsonObject

  return Object.fromEntries(
    Object.entries(cells).filter(([column]) => !hidden.has(column))
  )
}

// The payload without the values of the tool's fields and table columns the
// client never gets.
export function withoutInternalValues(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const { fields, columns } = internalParts(toolId)

  if (fields.size === 0 && columns.size === 0) {
    return payload
  }

  const shown: JsonObject = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) {
      continue
    }

    const hidden = columns.get(key)

    shown[key] =
      hidden && Array.isArray(value)
        ? value.map((cells) => withoutColumns(cells, hidden))
        : value
  }

  return shown
}
