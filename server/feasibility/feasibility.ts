import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { intakeSubmissions, toolRecords, type JsonObject } from "@/db/schema"
import { impactOf } from "@/lib/feasibility"
import type { Transaction } from "@/server/audit/audit"
import { riskValues } from "@/server/risk/risk"

export const FEASIBILITY = "D1.12"

type Reader = Pick<Transaction, "select">

const request = z.object({
  target_timeline: z.string().optional().catch(undefined),
  budget_expectations: z.string().optional().catch(undefined),
})

const register = z.object({
  risks: z
    .array(
      z.object({
        category: z.string().catch(""),
        description: z.string().catch(""),
        impact: z.string().optional().catch(undefined),
        mitigation: z.string().catch(""),
      })
    )
    .catch([]),
})

// What 1.0 and 4.0 of D1.12 show: as D1.11's, with the timeline and budget
// the client gave on the web request.
export async function feasibilityValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [saved] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const answers = request.parse(saved?.submission ?? {})

  return {
    ...(await riskValues(database, projectId, payload)),
    clientTimeline: answers.target_timeline || "Not provided",
    clientBudget: answers.budget_expectations || "Not provided",
  }
}

// Where 3.0 starts before the LE saves anything: each risk in the locked
// D1.11's register, with its impact and mitigation.
export async function feasibilityStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [assessed] = await database
    .select({ payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, "D1.11"),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  const { risks } = register.parse(assessed?.payload ?? {})

  return {
    criticalRisks: risks.map((each) => {
      const impact = impactOf(each.impact)

      return {
        risk: [each.category, each.description].filter(Boolean).join(": "),
        mitigation: each.mitigation,
        ...(impact && { impact }),
      }
    }),
  }
}
