import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { capabilityValues } from "@/server/capability/capability"

export const RISK = "D1.11"

type Reader = Pick<Transaction, "select">

const capability = z.object({
  overallCapabilityStatus: z.string().optional().catch(undefined),
})

// What 1.0 of D1.11 shows: as D1.10's, with the capability status D1.10 was
// approved with.
export async function riskValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [assessed] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, "D1.10"),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const shared = await capabilityValues(database, projectId, payload)

  return {
    assessor: shared.assessor ?? "",
    clientName: shared.clientName ?? "",
    requestId: shared.requestId ?? "",
    assessmentDate: shared.assessmentDate ?? "",
    overallCapabilityStatus:
      capability.parse(assessed?.payload ?? {}).overallCapabilityStatus ?? "",
  }
}
