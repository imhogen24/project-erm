import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const official = z
  .object({ startDate: z.string().optional().catch(undefined) })
  .catch({})

const estimate = z
  .object({
    labor: z
      .array(
        z
          .object({
            module: z.string().optional().catch(undefined),
            days: z.number().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ labor: [] })

const signed = z
  .object({
    pmSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ pmSignature: undefined })

// Where D4.1 starts before the LE saves anything: Target Project Start Date
// on D2.14's Official Project Start Date, 2.0 on one row per D1.14
// Engineering Module with its Estimated Days. The LE can change every one.
export async function technicalNotesStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [launch, cost] = await Promise.all([
    lockedPayload(database, projectId, "D2.14"),
    lockedPayload(database, projectId, "D1.14"),
  ])

  const { startDate } = official.parse(launch)
  const { labor } = estimate.parse(cost)

  return {
    ...(startDate && { targetStartDate: startDate }),
    ...(labor.length > 0 && {
      skills: labor.map(({ module, days }) => ({
        ...(module && { module }),
        ...(days !== undefined && { days }),
      })),
    }),
  }
}

// What 1.0 and 4.0 of D4.1 show, read live: the request ID, the PM, the
// project and client names, the day the LE submitted it and the day the PM
// signed.
export async function technicalNotesValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, pm] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "PM"),
  ])

  const [submitted] = record
    ? await database
        .select({ submittedAt: toolRecords.submittedAt })
        .from(toolRecords)
        .where(eq(toolRecords.id, record.id))
    : []

  const signedAt = signed.parse(record?.payload ?? {}).pmSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    projectManager: pm,
    ...(submitted?.submittedAt && {
      breakdownDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
