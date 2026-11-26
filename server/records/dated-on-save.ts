import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

const day = z.iso.date()

function datedFields(toolId: string) {
  return (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    "datedOnSave" in field && field.datedOnSave
      ? [{ key: field.key, ...field.datedOnSave }]
      : []
  )
}

// The dates a save sets (`datedOnSave`): the day the select first holds its
// option, the day already stored while it still does, and nothing once it
// does not. The form never sends them.
export function datedOnSave(
  toolId: string,
  before: JsonObject,
  next: JsonObject,
  today = new Date().toISOString().slice(0, 10)
): JsonObject {
  return Object.fromEntries(
    datedFields(toolId).flatMap((field) => {
      if (next[field.field] !== field.is) {
        return []
      }

      const held = day.safeParse(before[field.key])

      const kept =
        before[field.field] === field.is && held.success ? held.data : today

      return [[field.key, kept]]
    })
  )
}

// The keys `datedOnSave` writes, so a save drops one the select no longer
// holds.
export function datedKeys(toolId: string): string[] {
  return datedFields(toolId).map((field) => field.key)
}
