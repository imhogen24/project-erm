import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  intakeSubmissions,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import { pricedLines, quoteSummary, t3Deliverables } from "@/lib/project-brief"
import type { Transaction } from "@/server/audit/audit"
import type { FieldError } from "@/server/records/validate"
import { reviewValues } from "@/server/review/internal-review"

type Reader = Pick<Transaction, "select">

// What a submit stores beside what was typed, and what stops it.
export type SubmitWork = { values: JsonObject; errors: FieldError[] }

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

async function requestIdOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  return project?.requestId ?? ""
}

const contact = z.object({
  organization_name: z.string().optional().catch(undefined),
  contact_person: z.string().optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  phone_number: z.string().optional().catch(undefined),
})

const titled = z.object({
  projectTitle: z.string().optional().catch(undefined),
})

const feasibility = z.object({
  realisticTimeline: z.string().optional().catch(undefined),
})

// What 1.0 of D1.15 shows: the client's details from their web request, the
// request ID, the project's title and D1.12's realistic timeline.
export async function briefValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const client = contact.parse(saved?.submission ?? {})

  const timeline = feasibility.parse(
    await lockedPayload(database, projectId, "D1.12")
  ).realisticTimeline

  return {
    requestId: await requestIdOf(database, projectId),
    clientName: client.organization_name ?? "",
    contactPerson: client.contact_person ?? "",
    contactDetails: [client.email, client.phone_number]
      .filter(Boolean)
      .join(" / "),
    projectTitle:
      titled.parse(await reviewValues(database, projectId)).projectTitle ?? "",
    duration: timeline ?? "",
  }
}

const text = z.string().catch("")

const scope = z.object({
  vision: z.string().optional().catch(undefined),
  phases: z
    .array(
      z.object({
        name: text,
        activities: text,
        duration: text,
        target: text,
      })
    )
    .catch([]),
  excludedScope: z
    .array(z.object({ category: text, description: text }))
    .catch([]),
  clientResponsibilities: z
    .array(z.object({ requirement: text, description: text }))
    .catch([]),
})

const estimate = z.object({
  allocations: z
    .array(
      z.object({
        deliverable: text,
        cost: z.coerce.number().finite().optional().catch(undefined),
      })
    )
    .catch([]),
  totalProjectValue: z.coerce.number().finite().optional().catch(undefined),
})

function line(parts: string[]) {
  return parts.filter(Boolean).join(": ")
}

// Where D1.15 starts before the LE saves anything: D1.13's vision, phases,
// exclusions and client responsibilities, and D1.14's allocations.
export async function briefStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const sow = scope.parse(await lockedPayload(database, projectId, "D1.13"))

  const costed = estimate.parse(
    await lockedPayload(database, projectId, "D1.14")
  )

  return {
    vision: sow.vision ?? "",
    phases: sow.phases.map((phase, index) => ({
      phaseNo: String(index + 1),
      name: phase.name,
      deliverables: phase.activities,
      duration: phase.duration,
      target: phase.target,
    })),
    budget: costed.allocations.map((each): JsonObject =>
      each.cost === undefined
        ? { deliverable: each.deliverable }
        : { deliverable: each.deliverable, value: each.cost }
    ),
    outOfScope: sow.excludedScope
      .map((each) => line([each.category, each.description]))
      .join("\n"),
    clientDependencies: sow.clientResponsibilities
      .map((each) => line([each.requirement, each.description]))
      .join("\n"),
  }
}

const budgeted = z.object({
  budget: z
    .array(z.object({ value: z.coerce.number().finite().catch(0) }))
    .catch([]),
})

// Submitting D1.15 is refused while its budget does not add up to the total
// project value D1.14 was approved with.
export async function briefOnSubmit(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<SubmitWork> {
  const total = estimate.parse(
    await lockedPayload(database, projectId, "D1.14")
  ).totalProjectValue

  const budget =
    Math.round(
      budgeted.parse(payload).budget.reduce((sum, row) => sum + row.value, 0) *
        100
    ) / 100

  return {
    values: {},
    errors:
      total === undefined || budget === total
        ? []
        : [
            {
              field: "budget",
              message: `The budget must add up to D1.14's total project value, ${ghs(total)}`,
            },
          ],
  }
}

// What T3.D1.15a shows that the sheet cannot work out by itself.
export async function quoteValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  return { requestId: await requestIdOf(database, projectId) }
}

// Where T3.D1.15a starts: the standard deliverables with what each usually
// is and comes as.
export function quoteStart(): JsonObject {
  return {
    deliverables: t3Deliverables.map((each) => ({
      item: each.item,
      description: each.description,
      format: each.format,
    })),
  }
}

// Submitting T3.D1.15a stores each line's subtotal and the total.
export function quoteOnSubmit(payload: JsonObject): SubmitWork {
  return {
    values: {
      pricing: pricedLines(payload),
      totalT3ProjectValue: quoteSummary(payload).total,
    },
    errors: [],
  }
}
