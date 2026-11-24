import type { JsonObject } from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import type { Fills } from "@/lib/placeholders"
import { contractDefaults } from "@/lib/standard-contract"
import type { Transaction } from "@/server/audit/audit"
import { clientAndValue, holderOf } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

// Who 1.0's Reviewed By starts as: the project's Project Manager. The app has
// no project owner, so the PM stands in for one; with no PM on the project it
// starts empty. Change this one function to start it from someone else.
export async function reviewerOf(database: Reader, projectId: string) {
  return await holderOf(database, projectId, "PM")
}

// Today in Ghana, which keeps UTC, as YYYY-MM-DD.
function today(now: Date) {
  return now.toISOString().slice(0, 10)
}

// Where D2.1's 1.0 starts before the CA saves anything: today as the legal
// review date, the project's PM as the reviewer, and Ghana and GHS. Each can
// be changed. The clauses start from the definition's fixed rows.
export async function contractStart(
  database: Reader,
  projectId: string,
  now = new Date()
): Promise<JsonObject> {
  return {
    lastLegalReviewDate: today(now),
    reviewedBy: await reviewerOf(database, projectId),
    jurisdiction: contractDefaults.jurisdiction,
    currency: contractDefaults.currency,
  }
}

// The bracketed values of D2.1's clauses the system fills in, read from the
// project each time they are shown, so nothing is copied: the client's name
// and the approved brief's total. One the project does not hold yet is left
// out, so the clause keeps its [bracket].
export async function contractFills(
  database: Reader,
  projectId: string
): Promise<Fills> {
  const known = await clientAndValue(database, projectId)

  if (!known) {
    return {}
  }

  const fills: Fills = { "Client Name": known.clientName }

  if (known.value) {
    fills["Total GHS"] = ghs(known.value)
  }

  return fills
}
