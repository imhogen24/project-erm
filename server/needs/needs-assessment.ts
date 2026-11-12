import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  intakeSubmissions,
  people,
  projects,
  toolRecords,
  type RecordState,
} from "@/db/schema"
import type { needsCategories } from "@/lib/needs-assessment"
import type { Transaction } from "@/server/audit/audit"

export const NEEDS_ASSESSMENT = "D1.8"

const RAW_NOTES = "D1.7"

type Reader = Pick<Transaction, "select">

type Category = (typeof needsCategories)[number]

// The Tier 1 web form's technical answers. Contact details are left out: the
// Lead Engineer may not read the client's request (D1.1), only what it says
// about the system to design.
const technical = z.object({
  material_inputs: z.string().optional().catch(undefined),
  energy_and_information_inputs: z.string().optional().catch(undefined),
  outputs: z.string().optional().catch(undefined),
  by_products: z.string().optional().catch(undefined),
  human_system: z.string().optional().catch(undefined),
  active_environment: z.string().optional().catch(undefined),
})

// What the client wrote on the web form for each 2.0 category it answers.
export async function clientTechnicalAnswers(
  database: Reader,
  projectId: string
): Promise<Partial<Record<Category, string>>> {
  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const answers = technical.parse(saved?.submission ?? {})

  const said = (label: string, value?: string) =>
    value?.trim() ? `${label}: ${value.trim()}` : undefined

  const outputs = [
    said("Outputs", answers.outputs),
    said("By-products", answers.by_products),
  ]
    .filter(Boolean)
    .join(" · ")

  const entries: [Category, string | undefined][] = [
    ["INPUT: Material", said("Client", answers.material_inputs)],
    ["INPUT: Energy", said("Client", answers.energy_and_information_inputs)],
    [
      "INPUT: Information",
      said("Client", answers.energy_and_information_inputs),
    ],
    ["OUTPUT: Material", outputs || undefined],
    ["OPERATOR: Human System", said("Client", answers.human_system)],
    ["OPERATOR: Active Env.", said("Client", answers.active_environment)],
  ]

  return Object.fromEntries(
    entries.filter((entry): entry is [Category, string] => !!entry[1])
  )
}

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// What 1.0 and 4.0 show, from the records themselves: who submitted D1.8 and
// when, whether the PM has approved it, the locked D1.7 it is built on, and
// the project. Before it is submitted, the writer's own name.
export async function synthesisValues(
  database: Reader,
  projectId: string,
  record: { id: string; state: RecordState } | null,
  writer?: string
): Promise<Record<string, string>> {
  const [project] = await database
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  const [notes] = await database
    .select({ lockedAt: toolRecords.lockedAt })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, RAW_NOTES),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const [saved] = record
    ? await database
        .select({ submittedAt: toolRecords.submittedAt, name: people.name })
        .from(toolRecords)
        .leftJoin(people, eq(people.id, toolRecords.submittedBy))
        .where(eq(toolRecords.id, record.id))
    : []

  const sent = record !== null && record.state !== "draft"
  const synthesizedBy = (sent ? saved?.name : writer) ?? ""

  return {
    synthesizedBy,
    synthesisDate:
      sent && saved?.submittedAt ? day.format(saved.submittedAt) : "",
    rawNotesReference: notes?.lockedAt
      ? `D1.7 Raw Meeting Notes, approved ${day.format(notes.lockedAt)}`
      : "D1.7 Raw Meeting Notes",
    clientProjectName: project?.name ?? "",
    synthesisComplete: sent ? "Yes" : "No",
    readyForReview: record?.state === "locked" ? "Yes" : "No",
  }
}
