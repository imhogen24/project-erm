import { and, eq } from "drizzle-orm"

import type { Database } from "@/db"
import { toolRecords } from "@/db/schema"

export class GateClosedError extends Error {}

export type Gate = {
  // The key tool. Its record must be locked before the guarded tools open.
  tool: string
  // Tool ID prefixes the gate guards.
  opens: readonly string[]
}

export const gates: readonly Gate[] = [
  { tool: "D1.15", opens: ["D2."] },
  { tool: "D3.10", opens: ["D4."] },
  { tool: "D4.8", opens: ["D5.", "P5."] },
]

export function gateFor(toolId: string): Gate | undefined {
  return gates.find((gate) =>
    gate.opens.some((prefix) => toolId.startsWith(prefix))
  )
}

export async function assertGateOpen(
  database: Database,
  projectId: string,
  toolId: string
): Promise<void> {
  const gate = gateFor(toolId)

  if (!gate) {
    return
  }

  const [locked] = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, gate.tool),
        eq(toolRecords.state, "locked")
      )
    )
    .limit(1)

  if (!locked) {
    throw new GateClosedError(
      `${toolId} cannot be created until ${gate.tool} is locked on this project`
    )
  }
}
