import { eq } from "drizzle-orm"
import { z } from "zod"

import { people, projects, toolRecords, type JsonObject } from "@/db/schema"
import type { RecordState } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { matchingIn } from "@/server/payments/reconciled-submit"

type Reader = Pick<Transaction, "select">

const signed = z
  .object({
    foSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({})

// The day in Ghana, which keeps UTC, as YYYY-MM-DD.
function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// Who submitted the record and when, once it is submitted.
async function submitterOf(database: Reader, recordId: string) {
  const [row] = await database
    .select({ name: people.name, at: toolRecords.submittedAt })
    .from(toolRecords)
    .innerJoin(people, eq(people.id, toolRecords.submittedBy))
    .where(eq(toolRecords.id, recordId))

  return row
}

// What the system fills into a cycle's D3.8, read live: the request ID, the
// project and client names, and the day the FO signed. While it is a draft,
// 2.0's sums from the cycle's invoice and bank checks; once submitted, the
// FO who submitted it and the day, beside the sums it was submitted with.
export async function reconciledValues(
  database: Reader,
  projectId: string,
  record: {
    id?: string
    state: RecordState | "notStarted"
    payload: JsonObject
  },
  cycle: number
): Promise<JsonObject> {
  const [[project], names] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
  ])

  const signedAt = signed.parse(record.payload).foSignature?.signedAt

  const shared = {
    ...names,
    requestId: project?.requestId ?? "",
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }

  if (record.state === "draft" || record.state === "notStarted") {
    return { ...shared, ...(await matchingIn(database, projectId, cycle)) }
  }

  const submitter = record.id && (await submitterOf(database, record.id))

  return {
    ...shared,
    ...(submitter && { reconcilingOfficer: submitter.name }),
    ...(submitter && submitter.at && { dateReconciled: dayOf(submitter.at) }),
  }
}
