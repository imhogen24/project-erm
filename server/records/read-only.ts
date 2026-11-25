import { isDeepStrictEqual } from "node:util"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { ValidationError, type FieldError } from "./validate"

const refused = "Read-only, so the form cannot change it"

const sentAlready = "Already sent, so this cannot change"

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
        field.type === "table" &&
        (field.readOnly ||
          (field.readOnlyWhen &&
            (stored ?? values)[field.readOnlyWhen.field] ===
              field.readOnlyWhen.is))
          ? [field.key]
          : []
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

  // Once what a tool sends has gone, such as D2.7's email, the fields it
  // sent keep what they held.
  const freeze = tools.getTool(toolId)?.freezesOnceSet

  if (freeze && stored?.[freeze.field] !== undefined) {
    const changed = freeze.fields.filter(
      (key) =>
        kept[key] !== undefined && !isDeepStrictEqual(kept[key], stored[key])
    )

    if (changed.length > 0) {
      throw new ValidationError(
        changed.map((field) => ({ field, message: sentAlready }))
      )
    }

    for (const key of freeze.fields) {
      if (stored[key] === undefined) {
        delete kept[key]
      } else {
        kept[key] = stored[key]
      }
    }
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
