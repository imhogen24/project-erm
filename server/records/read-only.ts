import { isDeepStrictEqual } from "node:util"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { ValidationError, type FieldError } from "./validate"

const refused = "Read-only, so the form cannot change it"

// The tables the form shows without letting it change them. The system and the
// screens built for them write their rows, so a save from the form must hand
// back what is stored, or leave the table out.
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

  return kept
}
