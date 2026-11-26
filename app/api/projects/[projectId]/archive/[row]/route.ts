import { notFound } from "next/navigation"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { archivedPdf } from "@/server/pdf/archive"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

// One document of the project's archive, saved as a file under its standard
// name. Every refusal is the same not-found answer.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; row: string }> }
) {
  const { projectId, row } = await params

  ensureToolsRegistered()

  const session = await requireSession()
  const index = z.coerce.number().int().min(0).safeParse(row)

  if (!z.uuid().safeParse(projectId).success || !index.success) {
    notFound()
  }

  let pdf

  try {
    pdf = await archivedPdf(
      getDatabase(),
      session.user.id,
      projectId,
      index.data
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof RecordNotFoundError
    ) {
      notFound()
    }

    throw error
  }

  return pdfResponse(pdf, "attachment")
}
