import { isDeepStrictEqual } from "node:util"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { ValidationError, type FieldError } from "./validate"

const refused = "Read-only, so the form cannot change it"

// The tables the form shows without letting it change them, and the fields the
// system fills in. The system and the screens built for them write these, so a
// save from the form must hand back what is stored, or leave it out.
export function keepReadOnly(
  toolId: string,
  stored: JsonObject | undefined,
  values: JsonObject
): JsonObject {
  const keys =
    tools
      .getTool(toolId)
      ?.fields.flatMap((field) =>
        field.type === "table" && field.readOnly ? [field.key] : []
      ) ?? []

  const errors: FieldError[] = []
  const kept = { ...values }

  for (const key of keys) {
    const held = stored?.[key]

    if (kept[key] !== undefined && !isDeepStrictEqual(kept[key], held ?? [])) {
      errors.push({ field: key, message: refused })
    }

    if (held === undefined) {
      delete kept[key]
    } else {
      kept[key] = held
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors)
  }

  // A system-filled value, such as the client's choice on D1.5, is written
  // only by the system, so a save from the form keeps what is stored. The
  // form cannot send one: validation refuses it.
  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.systemFilled && stored?.[field.key] !== undefined) {
      kept[field.key] = stored[field.key]!
    }
  }

  return kept
}
