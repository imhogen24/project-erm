import { eq } from "drizzle-orm"

import { people, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { tools } from "@/server/tools/registry"

import type { FieldError } from "./validate"

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(when: Date) {
  return when.toISOString().slice(0, 10)
}

// What the tool's fields filled on lock hold as the record locks now: the
// name of the person who submitted it, or the day. Empty for a tool with none.
export async function lockValues(
  transaction: Pick<Transaction, "select">,
  record: { toolId: string; submittedBy: string | null },
  locker: string,
  now: Date
): Promise<JsonObject> {
  const fields = (tools.getTool(record.toolId)?.fields ?? []).flatMap(
    (field) =>
      "filledOnLock" in field && field.filledOnLock
        ? [{ key: field.key, fill: field.filledOnLock }]
        : []
  )

  if (fields.length === 0) {
    return {}
  }

  const submitter = record.submittedBy ?? locker

  const [person] = await transaction
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, submitter))

  return Object.fromEntries(
    fields.map(({ key, fill }) => [
      key,
      fill === "lockedAt" ? dayOf(now) : (person?.name ?? ""),
    ])
  )
}

// The tool's select fields that do not yet hold the option submitting needs,
// each with what to say about it.
export function unmetSubmitRules(
  toolId: string,
  payload: JsonObject
): FieldError[] {
  return (tools.getTool(toolId)?.submitWhen ?? []).flatMap((rule) =>
    payload[rule.field] === rule.is
      ? []
      : [{ field: rule.field, message: rule.message }]
  )
}
