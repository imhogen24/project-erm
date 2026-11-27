import { isDeepStrictEqual } from "node:util"

import { z } from "zod"

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

  // A cell a signature sets (`setOnSign`), such as D2.14's "PM received this
  // notice", or the lock sets (`setOnLock`), such as D3.5's conversion
  // tasks, keeps what is stored, or its column's starting option.
  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.type !== "table" || (!field.setOnSign && !field.setOnLock)) {
      continue
    }

    const rows = z
      .array(z.record(z.string(), z.unknown()))
      .safeParse(kept[field.key])

    if (!rows.success) {
      continue
    }

    const held = z
      .array(z.record(z.string(), z.unknown()))
      .catch([])
      .parse(stored?.[field.key])

    const copy = rows.data.map((row) => ({ ...row }))

    for (const rule of [
      ...(field.setOnSign ?? []),
      ...(field.setOnLock ?? []),
    ]) {
      const row = copy[rule.row]

      if (!row) {
        continue
      }

      const start = field.columns.find(
        (column) => column.key === rule.column
      )?.startsAs

      const value = held[rule.row]?.[rule.column] ?? start

      if (value === undefined) {
        delete row[rule.column]
      } else {
        row[rule.column] = value
      }
    }

    // SAFETY: rows of cells read from the values, one cell kept as stored.
    kept[field.key] = copy as JsonObject[]
  }

  // A table whose rows come from another tool's (`rowsFrom`), such as D3.2's
  // schedule, keeps only what the person writes, each row by its key.
  for (const field of tools.getTool(toolId)?.fields ?? []) {
    if (field.type !== "table" || !field.rowsFrom) {
      continue
    }

    const rows = z
      .array(z.record(z.string(), z.json()))
      .safeParse(kept[field.key])

    if (!rows.success) {
      continue
    }

    const { keyedBy } = field.rowsFrom

    const written = field.columns.filter(
      (column) => !column.systemFilled && !column.inherited && !column.numbered
    )

    // A row the person added after the sourced ones (`addRows`) holds no
    // key and is kept as typed, its system columns too.
    const typedToo = field.columns.filter(
      (column) => column.systemFilled && !column.numbered
    )

    const cellsOf = (
      row: (typeof rows.data)[number],
      columns: typeof written
    ) =>
      Object.fromEntries(
        columns.flatMap((column) =>
          row[column.key] === undefined ? [] : [[column.key, row[column.key]]]
        )
      )

    kept[field.key] = rows.data.map((row) =>
      field.rowsFrom?.addRows && !row[keyedBy]
        ? cellsOf(row, [...written, ...typedToo])
        : { [keyedBy]: row[keyedBy] ?? null, ...cellsOf(row, written) }
    )
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
