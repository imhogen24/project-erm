import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import { costSummary, ghs } from "@/lib/cost-estimation"
import {
  ANY_AVAILABLE,
  RESOURCE_REQUEST,
  utilizationText,
} from "@/lib/resource-request"
import { rosterBookings, TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { ownRows } from "@/server/records/review"

type Reader = Pick<Transaction, "select">

const text = z.string().trim().catch("")

const notes = z
  .object({
    skills: z
      .array(
        z
          .object({
            role: z.string().optional().catch(undefined),
            days: z.number().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ skills: [] })

const request = z
  .object({
    resourceRequests: z
      .array(
        z
          .object({
            role: text.optional(),
            preferredEngineer: text.optional(),
            days: z.number().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
    conflictCheck: z
      .array(
        z
          .object({
            approved: text.optional(),
            alternative: text.optional(),
          })
          .catch({})
      )
      .catch([]),
    heSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ resourceRequests: [], conflictCheck: [] })

// Where D4.2 starts before the LE saves anything: 2.0 on one row per D4.1
// 2.0 row, with its Required Role / Skill Level and Estimated Effort (Days).
// The LE can change every one.
export async function resourceRequestStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { skills } = notes.parse(
    await lockedPayload(database, projectId, "D4.1")
  )

  return skills.length > 0
    ? {
        resourceRequests: skills.map(({ role, days }) => ({
          ...(role && { role }),
          ...(days !== undefined && { days }),
        })),
      }
    : {}
}

// The engineer a 2.0 row names, or none when it names nobody or anyone free.
function named(engineer: string | undefined): string {
  return engineer && engineer !== ANY_AVAILABLE ? engineer : ""
}

// Each 2.0 row of a locked request with the engineer the HE settled on:
// the one asked for when approved, or the alternative the HE named for a
// row answered No. No engineer when the row named nobody or was not
// answered.
export function approvedRows(
  payload: JsonObject
): { role: string; engineer: string; days?: number }[] {
  const { resourceRequests } = request.parse(payload)

  const check = request.parse({
    ...payload,
    ...ownRows(RESOURCE_REQUEST, payload),
  }).conflictCheck

  return resourceRequests.map((row, index) => {
    const answer = check[index]

    const engineer =
      answer?.approved === "No"
        ? named(answer.alternative)
        : answer?.approved === "Yes"
          ? named(row.preferredEngineer)
          : ""

    return {
      role: row.role ?? "",
      engineer,
      ...(row.days !== undefined && { days: row.days }),
    }
  })
}

// Each engineer's days on the other active projects, by project name, read
// from those projects' locked team assignments (D4.3): the roster's
// Allocated Days. Keyed by the engineer's name.
export async function engineerBookings(
  database: Reader,
  exceptProjectId: string
): Promise<Map<string, { project: string; days: number }[]>> {
  const locked = await database
    .select({ project: projects.name, payload: toolRecords.payload })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(
      and(
        eq(toolRecords.toolId, TEAM_ASSIGNMENT),
        eq(toolRecords.state, "locked"),
        eq(projects.status, "active"),
        ne(toolRecords.projectId, exceptProjectId)
      )
    )

  const bookings = new Map<string, Map<string, number>>()

  for (const { project, payload } of locked) {
    for (const { engineer, days } of rosterBookings(payload)) {
      const byProject = bookings.get(engineer) ?? new Map<string, number>()

      byProject.set(project, (byProject.get(project) ?? 0) + days)
      bookings.set(engineer, byProject)
    }
  }

  return new Map(
    [...bookings].map(([engineer, byProject]) => [
      engineer,
      [...byProject]
        .map(([project, days]) => ({ project, days }))
        .sort((a, b) => a.project.localeCompare(b.project)),
    ])
  )
}

// What 1.0, 3.0 and 4.0 of D4.2 show, read live: the request ID, the PM,
// the project's name, the day the LE submitted it, D1.14's labour subtotal,
// one 3.0 row per 2.0 row with the engineer requested and their days on
// other projects, and the day the HE signed.
export async function resourceRequestValues(
  database: Reader,
  projectId: string,
  record: { id: string; payload: JsonObject } | null
): Promise<JsonObject> {
  const payload = record?.payload ?? {}

  const [[project], pm, cost, bookings] = await Promise.all([
    database
      .select({ requestId: projects.requestId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId)),
    holderOf(database, projectId, "PM"),
    lockedPayload(database, projectId, "D1.14"),
    engineerBookings(database, projectId),
  ])

  const [submitted] = record
    ? await database
        .select({ submittedAt: toolRecords.submittedAt })
        .from(toolRecords)
        .where(eq(toolRecords.id, record.id))
    : []

  const parsed = request.parse(payload)
  const rows = ownRows(RESOURCE_REQUEST, payload).conflictCheck
  const signedAt = parsed.heSignature?.signedAt

  const conflictCheck = z
    .array(z.record(z.string(), z.json()))
    .catch([])
    .parse(rows)
    .map((row, index) => {
      const asked = parsed.resourceRequests[index]
      const engineer = named(asked?.preferredEngineer)

      return {
        ...row,
        requestedEngineer: engineer || asked?.role || "",
        utilization: engineer
          ? utilizationText(bookings.get(engineer) ?? [])
          : "",
      }
    })

  return {
    requestId: project?.requestId ?? "",
    requestingPm: pm,
    projectName: project?.name ?? "",
    totalBudgetedLabor: ghs(costSummary(cost).laborSubtotal),
    conflictCheck,
    ...(submitted?.submittedAt && {
      requestDate: submitted.submittedAt.toISOString().slice(0, 10),
    }),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
