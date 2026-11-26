import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { lockedPayload } from "@/server/handoff/handoff"
import type { Field } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import type { FieldError } from "./validate"

type Reader = Pick<Transaction, "select">

type OptionsFromSelect = Extract<Field, { type: "select" }> & {
  optionsFrom: NonNullable<Extract<Field, { type: "select" }>["optionsFrom"]>
}

// A select's options as the project has them now: every row of the source
// table, and those that cannot be picked, since another record already holds
// them or they were taken before.
export type LiveOptions = { options: string[]; taken: string[] }

const rows = z.array(z.record(z.string(), z.unknown()).catch({})).catch([])

const text = z.string().catch("")

// The selects of the tool whose options come from another tool's table.
export function selectsFromTables(toolId: string): OptionsFromSelect[] {
  return (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    field.type === "select" && field.optionsFrom
      ? // SAFETY: the check just made holds that optionsFrom is set.
        [field as OptionsFromSelect]
      : []
  )
}

// The SN an option starts with, such as "2.2" of "2.2 Fabrication
// Milestone", so a row keeps its place when its description is changed.
export function snOf(option: string): string {
  return option.trim().split(/\s+/)[0] ?? ""
}

// Each row of the source table, as "SN Description": the SN from the
// table's numbered column, such as 2.1, 2.2, and the description from
// `column`.
async function rowOptions(
  database: Reader,
  projectId: string,
  from: OptionsFromSelect["optionsFrom"]
): Promise<string[]> {
  const table = tools
    .getTool(from.tool)
    ?.fields.find((field) => field.key === from.field)

  const numbered =
    table?.type === "table"
      ? table.columns.find((column) => column.numbered)?.numbered
      : undefined

  const payload = await lockedPayload(database, projectId, from.tool)

  return rows.parse(payload[from.field]).map((row, index) => {
    const sn = numbered ? `${numbered}.${index + 1}` : String(index + 1)
    const named = text.parse(row[from.column]).trim()

    return named === "" ? sn : `${sn} ${named}`
  })
}

// What each such select of the tool offers on the project, read live, with
// the options the tool's other records (not `recordId`, nor a void one)
// already hold marked taken, by SN.
export async function liveOptionsOf(
  database: Reader,
  projectId: string,
  toolId: string,
  recordId: string | null
): Promise<Map<string, LiveOptions>> {
  const selects = selectsFromTables(toolId)
  const result = new Map<string, LiveOptions>()

  if (selects.length === 0) {
    return result
  }

  const others = await database
    .select({ id: toolRecords.id, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void")
      )
    )

  for (const field of selects) {
    const options = await rowOptions(database, projectId, field.optionsFrom)

    const held = new Set(
      others
        .filter((record) => record.id !== recordId)
        .map((record) => snOf(text.parse(record.payload[field.key])))
        .filter((sn) => sn !== "")
    )

    const taken = options.filter(
      (option, index) =>
        index < (field.optionsFrom.takenBefore ?? 0) || held.has(snOf(option))
    )

    result.set(field.key, { options, taken })
  }

  return result
}

// The first option still free of each such select, for a record that has
// none yet, such as the next milestone to bill.
export function firstFree(live: Map<string, LiveOptions>): JsonObject {
  return Object.fromEntries(
    [...live].flatMap(([key, { options, taken }]) => {
      const free = options.find((option) => !taken.includes(option))

      return free ? [[key, free]] : []
    })
  )
}

// What stops a submit: a pick that is not one of the project's rows, or one
// another record already holds.
export async function unmetOptionsFrom(
  database: Reader,
  record: { id: string; projectId: string; toolId: string; payload: JsonObject }
): Promise<FieldError[]> {
  const live = await liveOptionsOf(
    database,
    record.projectId,
    record.toolId,
    record.id
  )

  return [...live].flatMap(([key, { options, taken }]) => {
    const picked = text.parse(record.payload[key])

    if (picked === "") {
      return []
    }

    const option = options.find((each) => snOf(each) === snOf(picked))

    if (!option) {
      return [{ field: key, message: `${picked} is not one of the options` }]
    }

    return taken.includes(option)
      ? [{ field: key, message: `${option} has already been taken` }]
      : []
  })
}
