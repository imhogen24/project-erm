import { eq } from "drizzle-orm"

import { people, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { tools } from "@/server/tools/registry"

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(when: Date) {
  return when.toISOString().slice(0, 10)
}

// What the approver's decision writes on a record of a tool that keeps it
// (`decision`), such as D3.3's Action Taken "Proceed to D3.4 Draft Invoice",
// the Finance Officer's name and the day the trigger was received. Empty for
// any other tool.
export async function decisionValues(
  transaction: Pick<Transaction, "select">,
  record: { toolId: string; submittedAt: Date | null },
  actor: string,
  decided: "approve" | "sendBack"
): Promise<JsonObject> {
  const decision = tools.getTool(record.toolId)?.decision

  if (!decision) {
    return {}
  }

  const [person] = decision.by
    ? await transaction
        .select({ name: people.name })
        .from(people)
        .where(eq(people.id, actor))
    : []

  return {
    [decision.field]: decision[decided],
    ...(decision.by && { [decision.by]: person?.name ?? "" }),
    ...(decision.receivedOn &&
      record.submittedAt && {
        [decision.receivedOn]: dayOf(record.submittedAt),
      }),
  }
}

function decisionKeys(toolId: string): Set<string> {
  const decision = tools.getTool(toolId)?.decision

  return new Set(
    decision
      ? [decision.field, decision.by, decision.receivedOn].flatMap((key) =>
          key ? [key] : []
        )
      : []
  )
}

// A record submitted again waits for a new decision, so the last one is
// cleared from it.
export function withoutDecision(
  toolId: string,
  payload: JsonObject
): JsonObject {
  const keys = decisionKeys(toolId)

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !keys.has(key))
  )
}

// The last decision on a draft that was sent back, which its writer's saves
// keep, so it still says it was rejected until submitted again.
export function heldDecision(toolId: string, payload: JsonObject): JsonObject {
  const keys = decisionKeys(toolId)

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => keys.has(key))
  )
}
