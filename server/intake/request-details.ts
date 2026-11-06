import { and, desc, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { intakeSubmissions, toolRecords } from "@/db/schema"
import {
  NOT_APPLICABLE,
  type RequestDetails,
  type RequestMetadata,
} from "@/lib/request-details"
import { reviewPayload } from "@/lib/review"
import { roleAllows, rolesOn } from "@/server/permissions/permissions"

// The two columns of the website row that D1.2 shows.
const copyColumns = z.object({
  email: z.string().catch(""),
  created_at: z.string().catch(""),
})

function metadataOf(
  submission: (typeof intakeSubmissions.$inferSelect)["submission"]
): RequestMetadata {
  const { email, created_at } = copyColumns.parse(submission)
  const received = new Date(created_at)

  return {
    source: "Web Form",
    receivedAt: Number.isNaN(received.getTime()) ? null : received,
    sender: email === "" ? null : email,
    recipient: NOT_APPLICABLE,
    subject: NOT_APPLICABLE,
  }
}

// What D1.2 shows that nobody types here: where the request came from, from the
// ERM's saved copy of the website request, and the files, from D1.1. Both are
// read every time, never copied onto D1.2, so a change in either shows at once.
// It works before D1.2 has a record. Only a person who may read D1.2 gets it, so
// a client, a person on another project and a project that does not exist all
// get null. It only reads, and the sender is a client detail, so nothing here
// puts it in a log or an error message.
export async function getRequestDetails(
  database: Database,
  actor: string,
  projectId: string
): Promise<RequestDetails | null> {
  const held = await rolesOn(database, actor, projectId)

  if (!roleAllows(held, "D1.2", "read")) {
    return null
  }

  const [copy] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))

  const [review] = await database
    .select({ id: toolRecords.id, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, "D1.1"),
        ne(toolRecords.state, "void")
      )
    )
    .orderBy(desc(toolRecords.cycle), desc(toolRecords.createdAt))
    .limit(1)

  return {
    metadata: copy ? metadataOf(copy.submission) : null,
    files: review ? reviewPayload.parse(review.payload).attachedFiles : [],
    filesRecordId: review?.id ?? null,
  }
}
