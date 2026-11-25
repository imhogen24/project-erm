import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { NEGOTIATION_INVITE } from "@/lib/negotiation-invite"
import type { Transaction } from "@/server/audit/audit"
import { lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const invite = z
  .object({ proposedDate: z.string().optional().catch(undefined) })
  .catch({})

const signature = z
  .object({
    leadSignature: z
      .object({ signedAt: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({})

// Where D2.9 starts before the CA saves anything: the meeting on the date
// D2.8 proposed. The CA can change it.
export async function negotiationNotesStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { proposedDate } = invite.parse(
    await lockedPayload(database, projectId, NEGOTIATION_INVITE)
  )

  return proposedDate ? { actualDate: proposedDate } : {}
}

// What D2.9 shows that the system fills, read live: the project's request
// ID, and the day the Lead Negotiator signed.
export async function negotiationNotesValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const signedAt = signature.parse(payload).leadSignature?.signedAt

  return {
    requestId: project?.requestId ?? "",
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
