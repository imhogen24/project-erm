import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { projects, toolRecords, type JsonObject } from "@/db/schema"
import {
  REVIEWED_DRAFT,
  deliverableCategories,
  dependencyLines,
  projectMilestones,
} from "@/lib/pm-review"
import { PROJECT_BRIEF } from "@/lib/project-brief"
import type { Transaction } from "@/server/audit/audit"
import { draftValues } from "@/server/contract/initial-draft"
import { lockedPayload } from "@/server/handoff/handoff"
import { shownTool } from "@/server/pdf/preview-source"

type Reader = Pick<Transaction, "select">

const brief = z.object({ clientDependencies: z.string().catch("") })

async function trackOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  return project?.track
}

// Where D2.3 starts before the PM saves anything: 2.0 and 3.0 with the
// sheet's rows, and 4.0 with a row for each of D1.15's client dependencies
// on Tier 1. Tier 3 has no D1.15, so 4.0 starts on one empty row, as it does
// when D1.15 lists none. Every row can be changed, and once saved the PM's
// values are kept.
export async function pmReviewStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const track = await trackOf(database, projectId)

  const dependencies =
    track === "Tier_1"
      ? dependencyLines(
          brief.parse(await lockedPayload(database, projectId, PROJECT_BRIEF))
            .clientDependencies
        )
      : []

  return {
    scopeVerification: deliverableCategories.map((category) => ({
      category,
    })),
    projectVerification: projectMilestones.map((milestone) => ({
      milestone,
    })),
    clientDependencies:
      dependencies.length === 0
        ? [{}]
        : dependencies.map((dependency) => ({ dependency })),
  }
}

// The day the project's draft, D2.2 or T3.D2.2a, was last locked, as
// YYYY-MM-DD, or empty while it never was.
async function draftLockedOn(database: Reader, projectId: string) {
  const track = await trackOf(database, projectId)
  const toolId = track ? shownTool(REVIEWED_DRAFT, track) : undefined

  if (!toolId) {
    return ""
  }

  const [draft] = await database
    .select({ lockedAt: toolRecords.lockedAt })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, toolId),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  return draft?.lockedAt?.toISOString().slice(0, 10) ?? ""
}

// What 1.0 of D2.3 shows, read live: the project's PM, the project and client
// names, and the day the draft was locked for review. The day the review is
// completed is filled in as it locks.
export async function pmReviewValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [draft, dateReceived] = await Promise.all([
    draftValues(database, projectId),
    draftLockedOn(database, projectId),
  ])

  return {
    projectManager: draft.projectManager ?? "",
    projectClientName: draft.projectClientName ?? "",
    dateReceived,
  }
}
