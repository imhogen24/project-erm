import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import {
  intakeSubmissions,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { reviewDirectives } from "@/lib/internal-review"
import type { Transaction } from "@/server/audit/audit"
import { getTool } from "@/server/tools/registry"

export const INTERNAL_REVIEW = "D1.9"

type Reader = Pick<Transaction, "select">

const request = z.object({
  organization_name: z.string().optional().catch(undefined),
  project_title: z.string().optional().catch(undefined),
  target_timeline: z.string().optional().catch(undefined),
})

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// What the reviewers read first, by tier: the request record, the needs or
// measurements, and the client's own files on D1.1.
const readingFor = {
  Tier_1: ["D1.3", "D1.8", "D1.1"],
  Tier_3: ["T3.D1.3a", "T3.D1.8a", "D1.1"],
} as const

function stateShown(state: string | undefined): string {
  switch (state) {
    case "draft":
      return "Being written"
    case "submitted":
      return "Waiting for approval"
    case "approved":
      return "Approved"
    case "locked":
      return "Locked"
    default:
      return "Not started"
  }
}

// What 1.0 and 2.0 of D1.9 show, from the project, its web request and its
// records: who requests the review (the project's PM), the client, when the
// needs were synthesised (D1.8, or T3.D1.8a on Tier 3), the timeline the
// client asked for, the project's title, and the records to read.
export async function reviewValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [project] = await database
    .select({ name: projects.name, track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) {
    return {}
  }

  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const answers = request.parse(saved?.submission ?? {})

  const [pm] = await database
    .select({ name: people.name })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "PM")
      )
    )
    .limit(1)

  const reading = readingFor[project.track]

  const records = await database
    .select({
      toolId: toolRecords.toolId,
      state: toolRecords.state,
      submittedAt: toolRecords.submittedAt,
    })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        inArray(toolRecords.toolId, [...reading])
      )
    )
    .orderBy(desc(toolRecords.cycle))

  const recordOf = (toolId: string) =>
    records.find(
      (record) => record.toolId === toolId && record.state !== "void"
    )

  const synthesis = recordOf(reading[1])

  return {
    requestedBy: pm?.name ?? "",
    clientName: answers.organization_name ?? "",
    synthesisDate: synthesis?.submittedAt
      ? day.format(synthesis.submittedAt)
      : "",
    requiredCompletion: answers.target_timeline ?? "",
    projectTitle: answers.project_title || project.name,
    referenceMaterial: reading.map((toolId) => {
      const name = getTool(toolId)?.name ?? toolId

      return {
        document:
          toolId === "D1.1"
            ? "Client Supplementary Uploads (D1.1)"
            : `${toolId} ${name}`,
        link: `/projects/${projectId}/tools/${toolId}`,
        status: stateShown(recordOf(toolId)?.state),
      }
    }),
  }
}

// Where the review rows start before the OM saves anything: the sheet's four
// categories, each with its usual reviewer and question, still to be done.
export function reviewStart() {
  return {
    reviews: reviewDirectives.map((each) => ({ ...each, status: "Required" })),
  }
}
