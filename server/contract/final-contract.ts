import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { PENDING } from "@/lib/final-contract"
import { NEGOTIATION_NOTES } from "@/lib/negotiation-notes"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const notes = z
  .object({
    redlines: z
      .array(
        z.object({ resolution: z.string().catch("") }).catch({ resolution: "" })
      )
      .catch([]),
  })
  .catch({ redlines: [] })

const signature = z
  .object({
    caSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// Where D2.10 starts before the CA saves anything: one amendment per clause
// of the locked D2.9, each on its agreed resolution and Pending. Empty when
// nobody negotiated.
export async function finalContractStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { redlines } = notes.parse(
    await lockedPayload(database, projectId, NEGOTIATION_NOTES)
  )

  return {
    amendments: redlines.map((row) => ({
      concession: row.resolution,
      status: PENDING,
    })),
  }
}

// What D2.10 shows that the system fills, read live: the project's request
// ID, the project and client name, and the day the CA signed.
export async function finalContractValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const signedAt = signature.parse(payload).caSignature?.signedAt

  return {
    requestId: project?.requestId ?? "",
    ...(await baselineValues(database, projectId)),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
