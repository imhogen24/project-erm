import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { contractVariables } from "@/lib/baseline"
import { ghs } from "@/lib/cost-estimation"
import { INITIAL_DRAFT, coreVariables } from "@/lib/initial-draft"
import type { Transaction } from "@/server/audit/audit"
import { draftValues } from "@/server/contract/initial-draft"
import { clientAndValue, lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const [, , CONTRACT_VALUE, DURATION] = coreVariables.map((row) => row.variable)

const draftRows = z
  .object({
    coreVariables: z
      .array(z.object({ variable: z.string(), value: z.string().catch("") }))
      .catch([]),
  })
  .catch({ coreVariables: [] })

// The figures the draft holds for 2.0: on Tier 1 D2.2's contract value and
// duration, as the CA last locked them. T3.D2.2a holds no figures, so on
// Tier 3 the value is the quote's, T3.D1.15a's total, and the duration is
// unknown.
async function draftFigures(database: Reader, projectId: string) {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (project?.track === "Tier_3") {
    const known = await clientAndValue(database, projectId)

    return { value: known?.value ? ghs(known.value) : "", duration: "" }
  }

  const rows = draftRows.parse(
    await lockedPayload(database, projectId, INITIAL_DRAFT)
  ).coreVariables

  const valueOf = (variable: string | undefined) =>
    rows.find((row) => row.variable === variable)?.value ?? ""

  return { value: valueOf(CONTRACT_VALUE), duration: valueOf(DURATION) }
}

// Where D2.6 starts before the CA saves anything: 2.0's baselines from the
// draft where it holds them, the others empty. Every baseline can be changed,
// and once saved the CA's values are kept.
export async function baselineStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const figures = await draftFigures(database, projectId)

  const starts = [figures.value, "", figures.duration, ""]

  return {
    baseline: contractVariables.map((row, index) => ({
      variable: row.variable,
      baselineValue: starts[index] ?? "",
    })),
  }
}

// What 1.0 of D2.6 shows, read live: the project and client names. Who locked
// it and when are filled in as it locks.
export async function baselineValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const draft = await draftValues(database, projectId)

  return { projectClientName: draft.projectClientName ?? "" }
}
