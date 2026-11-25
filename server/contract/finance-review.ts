import { z } from "zod"

import type { JsonObject } from "@/db/schema"
import {
  OVERHEAD_MET,
  financialElements,
  overheadMetText,
  paymentMilestones,
  riskProtections,
} from "@/lib/finance-review"
import { PM_REVIEW } from "@/lib/pm-review"
import type { Fills } from "@/lib/placeholders"
import type { Transaction } from "@/server/audit/audit"
import { lockedOn } from "@/server/contract/pm-review"
import { draftValues } from "@/server/contract/initial-draft"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

// Where D2.4 starts before the FO saves anything: 2.0 to 4.0 on the sheet's
// rows. Every starting text can be changed, and once saved the FO's values
// are kept. Row 2.2's Contract Clause Ref is the table's fixed cell, filled
// in from D1.14 each time it is shown.
export function financeReviewStart(): JsonObject {
  return {
    valueVerification: financialElements.map((element) => ({ element })),
    paymentVerification: paymentMilestones.map((milestone) => ({
      milestone,
    })),
    riskVerification: riskProtections.map((protection) => ({ protection })),
  }
}

// What 1.0 of D2.4 shows, read live: the project's FO, the project and client
// names, and the day the PM's review was locked. The day the review is
// completed is filled in as it locks.
export async function financeReviewValues(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const [financeOfficer, draft, dateReceived] = await Promise.all([
    holderOf(database, projectId, "FO"),
    draftValues(database, projectId),
    lockedOn(database, projectId, PM_REVIEW),
  ])

  return {
    financeOfficer,
    projectClientName: draft.projectClientName ?? "",
    dateReceived,
  }
}

const estimate = z.object({
  minimumOverheadMet: z.boolean().optional().catch(undefined),
})

// Row 2.2's D1.14 answer, Yes or No, as the locked D1.14 holds it.
export async function financeReviewFills(
  database: Reader,
  projectId: string
): Promise<Fills> {
  const { minimumOverheadMet } = estimate.parse(
    await lockedPayload(database, projectId, "D1.14")
  )

  return { [OVERHEAD_MET]: overheadMetText(minimumOverheadMet) }
}
