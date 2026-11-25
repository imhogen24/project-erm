import type { JsonObject } from "@/db/schema"
import { FINANCE_REVIEW } from "@/lib/finance-review"
import { macroRisks, signOffCheckpoints } from "@/lib/executive-review"
import type { Transaction } from "@/server/audit/audit"
import { draftValues } from "@/server/contract/initial-draft"
import { lockedOn } from "@/server/contract/pm-review"
import { holderOf } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

// Where D2.5 starts before the executive saves anything: 2.0 and 3.0 on the
// sheet's rows. Every starting text can be changed, and once saved the
// executive's values are kept.
export function executiveReviewStart(): JsonObject {
  return {
    signOffVerification: signOffCheckpoints.map((checkpoint) => ({
      checkpoint,
    })),
    riskAssessment: macroRisks.map((risk) => ({ ...risk })),
  }
}

// What 1.0 of D2.5 shows, read live: the project's Head of R&D / Ops, the day
// the Finance Officer's review was locked, the project and client names, and
// the quote's total: D1.15's on Tier 1, T3.D1.15a's on Tier 3.
export async function executiveReviewValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [executive, draft, dateReceived] = await Promise.all([
    holderOf(database, projectId, "HE"),
    draftValues(database, projectId),
    lockedOn(database, projectId, FINANCE_REVIEW),
  ])

  return {
    executive,
    dateReceived,
    projectClientName: draft.projectClientName ?? "",
    projectValue: draft.projectValue ?? "",
  }
}
