import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import {
  coreVariables,
  deliverablesName,
  paymentSchedules,
  phases,
} from "@/lib/initial-draft"
import type { Fills } from "@/lib/placeholders"
import { PROJECT_BRIEF } from "@/lib/project-brief"
import type { Transaction } from "@/server/audit/audit"
import { briefValues } from "@/server/brief/project-brief"
import {
  clientAndValue,
  holderOf,
  lockedPayload,
} from "@/server/handoff/handoff"
import { shownTool } from "@/server/pdf/preview-source"

type Reader = Pick<Transaction, "select">

// What an empty D1.15 cell fills 5.0 with, as the PDF shows any empty answer.
const EMPTY = "—"

const text = z.string().catch("")

const brief = z.object({
  phases: z.array(z.object({ deliverables: text, duration: text })).catch([]),
  budget: z.array(z.object({ paymentSchedule: text })).catch([]),
})

const overview = z.object({ contactPerson: text, duration: text })

// The project's approved brief, as its track shows D1.15: its budget lines
// and phases, and the contact and duration its 1.0 shows.
async function briefOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  const toolId = project ? shownTool(PROJECT_BRIEF, project.track) : undefined

  return {
    ...brief.parse(
      toolId ? await lockedPayload(database, projectId, toolId) : {}
    ),
    ...overview.parse(await briefValues(database, projectId)),
  }
}

// Where D2.2 starts before the CA saves anything: 2.0's values, 3.0's
// payment schedules and 4.0's timelines from the client's request and D1.15.
// A row D1.15 has no line or phase for starts empty. Every value can be
// changed, and once saved the CA's values are kept.
export async function draftStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [known, figures] = await Promise.all([
    clientAndValue(database, projectId),
    briefOf(database, projectId),
  ])

  const values = [
    known?.clientName ?? "",
    figures.contactPerson,
    known?.value ? ghs(known.value) : "",
    figures.duration,
  ]

  return {
    coreVariables: coreVariables.map((row, index) => ({
      variable: row.variable,
      value: values[index] ?? "",
    })),
    paymentMilestones: paymentSchedules.map((milestone, index) => ({
      milestone,
      schedule: figures.budget[index]?.paymentSchedule ?? "",
    })),
    projectMilestones: phases.map((milestone, index) => ({
      milestone,
      timeline: figures.phases[index]?.duration ?? "",
    })),
  }
}

// What 1.0 of D2.2 shows, read live: the project's PM, the project and client
// names, and the approved brief's total. Who drafted it and when are filled
// in as it locks.
export async function draftValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [project] = await database
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  const known = await clientAndValue(database, projectId)

  return {
    projectManager: await holderOf(database, projectId, "PM"),
    // A client without an organisation is named after the project already.
    projectClientName: [...new Set([project?.name, known?.clientName])]
      .filter(Boolean)
      .join(" / "),
    projectValue: known?.value ? ghs(known.value) : "",
  }
}

// 5.0's deliverables, filled into its fixed rows from D1.15's phases each time
// they are shown, so they cannot be changed in D2.2. A phase D1.15 does not
// have reads as empty.
export async function draftFills(
  database: Reader,
  projectId: string
): Promise<Fills> {
  const figures = await briefOf(database, projectId)

  return Object.fromEntries(
    phases.map((phase, index) => [
      deliverablesName(phase),
      figures.phases[index]?.deliverables.trim() || EMPTY,
    ])
  )
}
