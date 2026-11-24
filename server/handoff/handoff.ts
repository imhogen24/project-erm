import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  intakeSubmissions,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
  type Role,
} from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import { handoffChecklist, handoffDirectives } from "@/lib/handoff"
import type { Transaction } from "@/server/audit/audit"

type Reader = Pick<Transaction, "select">

// The payload of the project's latest locked record of the tool, or empty.
export async function lockedPayload(
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

// The name of the person holding the role on the project, or empty.
export async function holderOf(
  database: Reader,
  projectId: string,
  role: Role
) {
  const [person] = await database
    .select({ name: people.name })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, role)
      )
    )
    .limit(1)

  return person?.name ?? ""
}

// The brief the handoff transfers: D1.15 on Tier 1, T3.D1.15a on Tier 3.
function briefOf(track: string) {
  return track === "Tier_3" ? { toolId: "T3.D1.15a" } : { toolId: "D1.15" }
}

const amount = z.coerce.number().finite().catch(0)

const tier1Brief = z.object({
  budget: z
    .array(
      z.object({
        value: amount,
        paymentSchedule: z.string().catch(""),
      })
    )
    .catch([]),
})

const tier3Quote = z.object({
  totalT3ProjectValue: z.coerce.number().finite().optional().catch(undefined),
})

const organisation = z.object({
  organization_name: z.string().optional().catch(undefined),
})

// The client's organisation, as their web request names it, and the approved
// brief's total: D1.15's budget on Tier 1, T3.D1.15a's total on Tier 3.
export async function clientAndValue(
  database: Reader,
  projectId: string
): Promise<{ clientName: string; value: number | undefined } | undefined> {
  const [project] = await database
    .select({ name: projects.name, track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (!project) {
    return undefined
  }

  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const payload = await lockedPayload(
    database,
    projectId,
    briefOf(project.track).toolId
  )

  return {
    clientName:
      organisation.parse(saved?.submission ?? {}).organization_name ??
      project.name,
    value:
      project.track === "Tier_3"
        ? tier3Quote.parse(payload).totalT3ProjectValue
        : tier1Brief
            .parse(payload)
            .budget.reduce((sum, line) => sum + line.value, 0),
  }
}

// What 1.0 of D1.16 shows: the request ID, who hands off and who receives,
// the client and the approved brief's value. 2.0's brief is a PDF preview.
export async function handoffValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [project] = await database
    .select({
      name: projects.name,
      requestId: projects.requestId,
      track: projects.serviceTrack,
    })
    .from(projects)
    .where(eq(projects.id, projectId))

  const known = await clientAndValue(database, projectId)

  if (!project || !known) {
    return {}
  }

  const { clientName, value } = known

  return {
    requestId: project.requestId,
    leadEngineer: await holderOf(database, projectId, "LE"),
    contractAdmin: await holderOf(database, projectId, "CA"),
    clientName,
    projectValue: value ? ghs(value) : "",
  }
}

// Where D1.16 starts before the LE saves anything: the brief's payment
// schedules as the terms, where each directive usually comes from, and who
// does each checklist task.
export async function handoffStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  const track = project?.track ?? "Tier_1"
  const brief = briefOf(track)

  const schedules =
    track === "Tier_1"
      ? tier1Brief
          .parse(await lockedPayload(database, projectId, brief.toolId))
          .budget.map((line) => line.paymentSchedule)
          .filter(Boolean)
      : []

  return {
    paymentTerms: [...new Set(schedules)].join("; "),
    directives: handoffDirectives.map((each) => ({
      category: each.category,
      source: each.source === "D1.15" ? brief.toolId : each.source,
    })),
    checklist: handoffChecklist.map((each) => ({
      task: each.task,
      assignee: each.assignee,
    })),
  }
}
