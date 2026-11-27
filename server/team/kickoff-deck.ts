import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const signed = z
  .object({
    pmSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ pmSignature: undefined })

// What 1.0 and 3.0 of D4.5 show, read live: the request ID, the project's
// PM, the project and client names, and the day the PM signed.
export async function kickoffDeckValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], preparedBy, names] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    holderOf(database, projectId, "PM"),
    baselineValues(database, projectId),
  ])

  const signedAt = signed.parse(payload).pmSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    preparedBy,
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
