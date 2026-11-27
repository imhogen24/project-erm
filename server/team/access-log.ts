import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, projects, toolRecords, type JsonObject } from "@/db/schema"
import { teamSize } from "@/lib/access-log"
import { rosterEngineers, TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const signed = z
  .object({
    adminSignature: z
      .object({ signedAt: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({ adminSignature: undefined })

// What 1.0 and 3.0 of D4.4 show, read live: the request ID, the project and
// client names, how many engineers D4.3's locked roster holds, who submitted
// it and when, and the day the HE signed.
export async function accessLogValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, assignment] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    lockedPayload(database, projectId, TEAM_ASSIGNMENT),
  ])

  const [submitted] = record
    ? await database
        .select({
          submittedAt: toolRecords.submittedAt,
          name: people.name,
        })
        .from(toolRecords)
        .leftJoin(people, eq(people.id, toolRecords.submittedBy))
        .where(eq(toolRecords.id, record.id))
    : []

  const signedAt = signed.parse(record?.payload ?? {}).adminSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    teamSize: teamSize(rosterEngineers(assignment).length),
    ...(submitted?.name && { executedBy: submitted.name }),
    ...(submitted?.submittedAt && {
      executedDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
