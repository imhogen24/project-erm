import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { toolRecords, type JsonObject, type RecordState } from "@/db/schema"
import { costSummary, ghs, withTotals } from "@/lib/cost-estimation"
import type { Transaction } from "@/server/audit/audit"
import type { FieldError } from "@/server/records/validate"

type Reader = Pick<Transaction, "select">

async function lockedPayload(
  database: Reader,
  projectId: string,
  toolId: string
): Promise<JsonObject> {
  const [record] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  return record?.payload ?? {}
}

const feasibility = z.object({
  costFloor: z.coerce.number().finite().optional().catch(undefined),
})

// The cost floor the LE set on the locked D1.12.
export async function costFloorOf(database: Reader, projectId: string) {
  return feasibility.parse(await lockedPayload(database, projectId, "D1.12"))
    .costFloor
}

const stored = z.object({
  minimumOverheadMet: z.boolean().optional().catch(undefined),
})

// What 5.0 of D1.14 shows that the sheet cannot work out by itself: D1.12's
// cost floor, and whether D1.15 may start.
export async function costValues(
  database: Reader,
  projectId: string,
  record: { state: RecordState | "notStarted"; payload: JsonObject }
): Promise<JsonObject> {
  const floor = await costFloorOf(database, projectId)
  const met = stored.parse(record.payload).minimumOverheadMet

  let readyForBriefing = "No, pending approval"

  if (record.state === "locked") {
    readyForBriefing = met
      ? "Yes"
      : "No, the minimum overhead recovery is not met; Finance reviews the estimate"
  }

  return { costFloor: floor ?? null, readyForBriefing }
}

const scope = z.object({
  includedScope: z
    .array(z.object({ category: z.string().catch("") }))
    .catch([]),
})

// Where 4.0 starts before the LE saves anything: one row for each deliverable
// of the locked D1.13's included scope.
export async function costStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { includedScope } = scope.parse(
    await lockedPayload(database, projectId, "D1.13")
  )

  const deliverables = [
    ...new Set(includedScope.map((row) => row.category).filter(Boolean)),
  ]

  return {
    allocations: deliverables.map((deliverable) => ({ deliverable })),
  }
}

// What submitting D1.14 stores: every total worked out from what was typed,
// against D1.12's cost floor, so the workflow can read whether the minimum
// overhead recovery is met. Refused while the allocations do not add up.
export async function costOnSubmit(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<{ values: JsonObject; errors: FieldError[] }> {
  const floor = await costFloorOf(database, projectId)
  const summary = costSummary({ ...payload, costFloor: floor ?? null })
  const errors: FieldError[] = []

  if (floor === undefined) {
    errors.push({
      field: "costFloor",
      message: "D1.12 has no cost floor to check against",
    })
  }

  if (summary.unallocated !== 0) {
    errors.push({
      field: "allocationCheck",
      message: `The allocations must add up to the total project value, ${ghs(summary.totalProjectValue)}`,
    })
  }

  return {
    errors,
    values: {
      ...withTotals(payload, summary),
      totalProjectValue: summary.totalProjectValue,
      costFloor: floor ?? null,
      minimumOverheadMet: summary.overheadMet === true,
    },
  }
}
