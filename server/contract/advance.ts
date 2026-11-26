import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects } from "@/db/schema"
import { INITIAL_DRAFT, coreVariables } from "@/lib/initial-draft"
import type { Transaction } from "@/server/audit/audit"
import { clientAndValue, lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const CONTRACT_VALUE = coreVariables[2]!.variable

const draftRows = z
  .object({
    coreVariables: z
      .array(z.object({ variable: z.string(), value: z.string().catch("") }))
      .catch([]),
  })
  .catch({ coreVariables: [] })

const template = z
  .object({ executionPercentage: z.number().optional().catch(undefined) })
  .catch({})

// An amount written as text, such as "GHS 94,400.00".
function amountIn(text: string): number | undefined {
  const digits = text.replace(/[^0-9.]/g, "")
  const value = Number(digits)

  return digits === "" || !Number.isFinite(value) ? undefined : value
}

// The contract's total: on Tier 1 the Total Contract Value D2.2 was locked
// with, and on Tier 3 the quote's total, T3.D1.15a's.
export async function contractValueOf(
  database: Reader,
  projectId: string
): Promise<number | undefined> {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  if (project?.track === "Tier_3") {
    return (await clientAndValue(database, projectId))?.value
  }

  const row = draftRows
    .parse(await lockedPayload(database, projectId, INITIAL_DRAFT))
    .coreVariables.find((each) => each.variable === CONTRACT_VALUE)

  return row ? amountIn(row.value) : undefined
}

// The advance payment due on execution: D2.1's Payable upon Execution (%)
// of the contract's total. D2.12 shows it, and D2.14 expects it.
export async function advanceDueOf(
  database: Reader,
  projectId: string
): Promise<number | undefined> {
  const [value, { executionPercentage }] = await Promise.all([
    contractValueOf(database, projectId),
    lockedPayload(database, projectId, "D2.1").then((payload) =>
      template.parse(payload)
    ),
  ])

  return value === undefined || executionPercentage === undefined
    ? undefined
    : Math.round(value * executionPercentage) / 100
}
