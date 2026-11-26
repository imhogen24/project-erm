import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { BASELINE } from "@/lib/baseline"
import type { Transaction } from "@/server/audit/audit"
import { advanceDueOf } from "@/server/contract/advance"
import { baselineValues } from "@/server/contract/baseline"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const TIMELINE = "Total Project Timeline"

const baseline = z
  .object({
    baseline: z
      .array(
        z.object({
          variable: z.string().catch(""),
          baselineValue: z.string().optional().catch(undefined),
        })
      )
      .catch([]),
  })
  .catch({ baseline: [] })

const executed = z
  .object({ invoiceNumber: z.string().optional().catch(undefined) })
  .catch({})

const greenLight = z
  .object({
    greenLightSignature: z
      .object({ signedAt: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({ greenLightSignature: undefined })

// Where D2.14 starts before the CA saves anything: D2.12's invoice number,
// and the advance due on execution. The CA can change both.
export async function initiationStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [{ invoiceNumber }, advance] = await Promise.all([
    lockedPayload(database, projectId, "D2.12").then((payload) =>
      executed.parse(payload)
    ),
    advanceDueOf(database, projectId),
  ])

  return {
    ...(invoiceNumber && { invoiceNumber }),
    ...(advance !== undefined && { amountExpected: advance }),
  }
}

// What D2.14 shows that the system fills, read live: the request ID, the
// day the CA submitted it, the project and client names, the project's PM,
// D2.6's baseline timeline, and the day the PM signed.
export async function initiationValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const [[project], names, pm, frozen] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    holderOf(database, projectId, "PM"),
    lockedPayload(database, projectId, BASELINE),
  ])

  const [submitted] = record
    ? await database
        .select({ submittedAt: toolRecords.submittedAt })
        .from(toolRecords)
        .where(eq(toolRecords.id, record.id))
    : []

  const timeline =
    baseline.parse(frozen).baseline.find((row) => row.variable === TIMELINE)
      ?.baselineValue ?? ""

  const signedAt = greenLight.parse(record?.payload ?? {}).greenLightSignature
    ?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    assignedPm: pm,
    totalTimeline: timeline,
    ...(submitted?.submittedAt && {
      noticeDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
