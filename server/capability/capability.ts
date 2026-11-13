import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  people,
  personProjectRoles,
  projects,
  type JsonObject,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { reviewValues } from "@/server/review/internal-review"

export const CAPABILITY = "D1.10"

type Reader = Pick<Transaction, "select">

const signed = z.object({ signedAt: z.string() })

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// What 1.0 of D1.10 shows: the project's Lead Engineer as assessor, the
// client, the project and its request ID, and the date the assessor signed.
export async function capabilityValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const [lead] = await database
    .select({ name: people.name })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "LE")
      )
    )
    .limit(1)

  const review = await reviewValues(database, projectId)
  const signature = signed.safeParse(payload.assessorSignature)

  return {
    assessor: lead?.name ?? "",
    clientName: review.clientName ?? "",
    projectTitle: review.projectTitle ?? "",
    requestId: project?.requestId ?? "",
    assessmentDate: signature.success
      ? day.format(new Date(signature.data.signedAt))
      : "",
  }
}
