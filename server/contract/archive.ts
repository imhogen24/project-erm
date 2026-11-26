import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { archivePath, fileNamePart } from "@/lib/archive"
import type { Transaction } from "@/server/audit/audit"
import { baselineValues } from "@/server/contract/baseline"
import { clientAndValue } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const caSigned = z
  .object({
    caSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ caSignature: undefined })

// What D2.13 shows that the system fills, read live: the request ID, the
// project and client names, the link to the project's archive page, and the
// day the CA signed. Who archived it and when fill in as it locks.
export async function archiveValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], names] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    baselineValues(database, projectId),
  ])

  const signedAt = caSigned.parse(payload).caSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    vaultLink: archivePath(projectId),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

// The client's name in 2.0's file names, such as IMHO_Brief_ClientTestLtd.pdf.
export async function archiveFills(
  database: Reader,
  projectId: string
): Promise<Record<string, string>> {
  const known = await clientAndValue(database, projectId)

  return { "Client Name": fileNamePart(known?.clientName ?? "") || "Client" }
}
