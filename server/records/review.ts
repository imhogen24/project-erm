import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import { tools } from "@/server/tools/registry"

import { unmetSubmitRules } from "./filled-on-lock"
import { signaturesOf } from "./signatures"
import { validateRecord, type FieldError } from "./validate"

const rows = z.array(z.record(z.string(), z.json()).catch({})).catch([])

const text = z.string().catch("")

// The fields only the approver fills (`reviewFields`), such as D4.2's
// conflict check. None for most tools.
export function reviewKeys(toolId: string): string[] {
  return tools.getTool(toolId)?.reviewFields ?? []
}

// Each table whose rows follow another table of this record (`rowsFrom`
// without a tool), as the record holds them now: one row per row of the
// source, keyed in order, such as 3.1, 3.2 for D4.2's 2.1, 2.2, each with
// what is stored under that key.
export function ownRows(toolId: string, payload: JsonObject): JsonObject {
  const fields = tools.getTool(toolId)?.fields ?? []

  return Object.fromEntries(
    fields.flatMap((field) => {
      if (field.type !== "table" || !field.rowsFrom || field.rowsFrom.tool) {
        return []
      }

      const { field: source, keyedBy } = field.rowsFrom

      const numbered = field.columns.find(
        (column) => column.key === keyedBy
      )?.numbered

      const held = new Map(
        rows
          .parse(payload[field.key])
          .map((row) => [text.parse(row[keyedBy]), row] as const)
      )

      const aligned = rows.parse(payload[source]).map((_, index) => {
        const key = numbered ? `${numbered}.${index + 1}` : String(index + 1)

        return { ...held.get(key), [keyedBy]: key }
      })

      return [[field.key, aligned]]
    })
  )
}

// What the writer's save keeps of the approver's fields: what is stored, so
// the writer can never change them.
export function keepReviewed(
  toolId: string,
  stored: JsonObject | undefined,
  values: JsonObject
): JsonObject {
  const kept = { ...values }

  for (const key of reviewKeys(toolId)) {
    if (stored?.[key] === undefined) {
      delete kept[key]
    } else {
      kept[key] = stored[key]
    }
  }

  return kept
}

// What the approver's save writes: the stored record with only the
// approver's fields taken from `values`.
export function withReview(
  toolId: string,
  stored: JsonObject,
  values: JsonObject
): JsonObject {
  const next = { ...stored }

  for (const key of reviewKeys(toolId)) {
    if (values[key] === undefined) {
      delete next[key]
    } else {
      next[key] = values[key]
    }
  }

  return next
}

// What stops the approver signing: an approver's field left unanswered, such
// as a 3.0 row of D4.2 with no Yes or No, or a No with no alternative, and
// any `reviewWhen` rule not met, such as 4.0 answered No.
export function unmetReview(toolId: string, payload: JsonObject): FieldError[] {
  const keys = reviewKeys(toolId)

  if (keys.length === 0) {
    return []
  }

  const reviewed = {
    ...Object.fromEntries(
      keys.flatMap((key) =>
        payload[key] === undefined ? [] : [[key, payload[key]]]
      )
    ),
    ...Object.fromEntries(
      Object.entries(ownRows(toolId, payload)).filter(([key]) =>
        keys.includes(key)
      )
    ),
  }

  const checked = validateRecord(toolId, reviewed, {
    forSubmit: true,
    review: true,
  })

  const rules = tools.getTool(toolId)?.reviewWhen ?? []

  const errors = [
    ...(checked.ok ? [] : checked.errors),
    ...unmetSubmitRules(toolId, { ...payload, ...reviewed }, new Map(), rules),
  ]

  // A signature on the record is never one of the approver's answers.
  const signatures = new Set(Object.keys(signaturesOf(toolId, payload)))

  return errors.filter((error) => !signatures.has(error.field))
}
