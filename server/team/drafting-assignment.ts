import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { technicalBaseline } from "@/lib/drafting-assignment"
import { daysIn } from "@/lib/follow-dates"
import type { Transaction } from "@/server/audit/audit"
import { lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const text = z.string().trim().optional().catch(undefined)

const intake = z
  .object({
    draftingSpecs: z
      .array(
        z
          .object({
            standard: text,
            toleranceClass: text,
            fileFormat: text,
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ draftingSpecs: [] })

const quote = z
  .object({
    deliverables: z.array(z.object({ timeline: text }).catch({})).catch([]),
  })
  .catch({ deliverables: [] })

const signature = z.object({ signedAt: z.string() }).optional().catch(undefined)

const signed = z
  .object({ pmSignature: signature, aeSignature: signature })
  .catch({ pmSignature: undefined, aeSignature: undefined })

// Where T3.D4.8a starts before the AE saves anything: 1.1 on the AE writing
// it, and each 3.0 requirement on T3.D1.3a's drafting specifications, every
// distinct value of its column across the rows, joined.
export async function draftingAssignmentStart(
  database: Reader,
  projectId: string,
  writer: string
): Promise<JsonObject> {
  const { draftingSpecs } = intake.parse(
    await lockedPayload(database, projectId, "T3.D1.3a")
  )

  return {
    roster: [{ engineer: writer }],
    technicalBaseline: technicalBaseline.map((row): JsonObject => {
      const requirement = [
        ...new Set(draftingSpecs.flatMap((spec) => spec[row.from] ?? [])),
      ]
        .filter((value) => value !== "")
        .join(", ")

      return requirement ? { requirement } : {}
    }),
  }
}

// The longest of T3.D1.15a's delivery timelines, as typed, such as
// "5 Days". Empty when none names a number of days or weeks.
function longestTimeline(payload: JsonObject) {
  return quote.parse(payload).deliverables.reduce(
    (longest, { timeline }) => {
      const days = timeline ? daysIn(timeline) : undefined

      return days !== undefined && days > longest.days
        ? { days, text: timeline! }
        : longest
    },
    { days: 0, text: "" }
  ).text
}

// What T3.D4.8a shows that the system fills, read live: the request ID,
// T3.D1.15a's delivery timeline each target date follows, and the day each
// of the PM and the AE signs.
export async function draftingAssignmentValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], quoted] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    lockedPayload(database, projectId, "T3.D1.15a"),
  ])

  const { pmSignature, aeSignature } = signed.parse(payload)

  return {
    requestId: project?.requestId ?? "",
    deliveryTimeline: longestTimeline(quoted),
    ...(pmSignature && { pmSignedDate: pmSignature.signedAt.slice(0, 10) }),
    ...(aeSignature && { aeSignedDate: aeSignature.signedAt.slice(0, 10) }),
  }
}
