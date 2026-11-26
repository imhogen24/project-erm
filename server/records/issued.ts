import type { JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { nextNumber } from "@/server/numbering/counters"
import { tools } from "@/server/tools/registry"

function issuedFields(toolId: string) {
  return (tools.getTool(toolId)?.fields ?? []).flatMap((field) =>
    "issuedFrom" in field && field.issuedFrom
      ? [{ key: field.key, sequence: field.issuedFrom }]
      : []
  )
}

// The numbers a new record of the tool is given, each the next of its
// field's running sequence (`issuedFrom`), such as D3.4's invoice number.
// Taken inside the transaction that creates the record, so a record that is
// not created gives its number back.
export async function issuedValues(
  transaction: Pick<Transaction, "insert">,
  toolId: string
): Promise<JsonObject> {
  const values: JsonObject = {}

  for (const field of issuedFields(toolId)) {
    values[field.key] = await nextNumber(transaction, field.sequence)
  }

  return values
}

// The numbers the record was given, which every save keeps, since the form
// never sends them.
export function heldIssued(toolId: string, payload: JsonObject): JsonObject {
  return Object.fromEntries(
    issuedFields(toolId).flatMap((field) =>
      payload[field.key] === undefined ? [] : [[field.key, payload[field.key]!]]
    )
  )
}
