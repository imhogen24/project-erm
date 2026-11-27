import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, projects, type JsonObject } from "@/db/schema"
import { computedCells, daysText } from "@/lib/computed-columns"
import { ghs } from "@/lib/cost-estimation"
import { LOCKED_BASELINE, startingPhases } from "@/lib/locked-baseline"
import { TECHNICAL_NOTES } from "@/lib/technical-notes"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { lockedPayload } from "@/server/handoff/handoff"
import type { SubmitWork } from "@/server/brief/project-brief"
import { sourcedRows, tableRows } from "@/server/records/sourced-rows"
import { tools } from "@/server/tools/registry"

type Reader = Pick<Transaction, "select">

const notes = z
  .object({ targetStartDate: z.string().optional().catch(undefined) })
  .catch({ targetStartDate: undefined })

const estimate = z
  .object({
    totalProjectValue: z.coerce.number().finite().optional().catch(undefined),
  })
  .catch({ totalProjectValue: undefined })

const roster = z
  .object({
    roster: z
      .array(
        z
          .object({
            role: z.string().trim().optional().catch(undefined),
            engineer: z.string().trim().optional().catch(undefined),
            days: z.number().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ roster: [] })

const signed = z
  .object({
    pmSignature: z
      .object({ signedBy: z.string(), signedAt: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({ pmSignature: undefined })

const day = z.iso.date().optional().catch(undefined)

// Where D4.8 starts before the HE saves anything: 2.0 on the three phases,
// 2.1 starting on D4.1's Target Project Start Date. Each later phase's start
// follows the one before as its end is picked (followsRowAbove).
export async function lockedBaselineStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { targetStartDate } = notes.parse(
    await lockedPayload(database, projectId, TECHNICAL_NOTES)
  )

  return {
    phases: startingPhases.map((phase, index) => ({
      phase,
      ...(index === 0 && targetStartDate && { startDate: targetStartDate }),
    })),
  }
}

// What D4.8 shows that the system fills, read live: the request ID, the
// project and client names, D1.14's Total Project Value, 3.0 on one row per
// engineer on D4.3's locked roster with their role and days and the buffer
// the HE typed, and, once the PM signs, who signed and the day.
export async function lockedBaselineValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], names, estimated, assignment] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
    lockedPayload(database, projectId, "D1.14"),
    lockedPayload(database, projectId, TEAM_ASSIGNMENT),
  ])

  const total = estimate.parse(estimated).totalProjectValue

  const rostered = roster.parse(assignment).roster.flatMap((row) =>
    row.engineer
      ? [
          {
            engineer: row.engineer,
            role: row.role ?? "",
            days: row.days === undefined ? "" : daysText(row.days),
          },
        ]
      : []
  )

  const signature = signed.parse(payload).pmSignature

  const [signer] = signature
    ? await database
        .select({ name: people.name })
        .from(people)
        .where(eq(people.id, signature.signedBy))
    : []

  return {
    requestId: project?.requestId ?? "",
    ...names,
    totalBudget: total === undefined ? "" : ghs(total),
    resources: sourcedRows(
      rostered,
      tableRows.parse(payload.resources),
      "engineer"
    ),
    ...(signature && {
      lockedBy: signer?.name ?? "",
      dateLocked: signature.signedAt.slice(0, 10),
      signedDate: signature.signedAt.slice(0, 10),
    }),
  }
}

// Submitting D4.8 stores each phase's working days, and is refused while a
// phase ends before it starts.
export function lockedBaselineOnSubmit(payload: JsonObject): SubmitWork {
  const errors = tableRows.parse(payload.phases).flatMap((row, index) => {
    const start = day.parse(row.startDate)
    const end = day.parse(row.endDate)

    return start && end && end < start
      ? [
          {
            field: "phases",
            row: index,
            column: "endDate",
            message: "Must be on or after the start date",
          },
        ]
      : []
  })

  return {
    values: computedCells(
      tools.getTool(LOCKED_BASELINE)?.fields ?? [],
      payload,
      "stored"
    ),
    errors,
  }
}
