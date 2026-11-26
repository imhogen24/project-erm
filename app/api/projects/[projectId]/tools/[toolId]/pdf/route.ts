import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { toolPdf } from "@/server/pdf/previews"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

// The project's record of a tool as it is now, as a PDF, for a PDF preview
// field. It shows in the page; `?download=1` saves it as a file instead, and
// `?cycle=N` gives one payment milestone cycle's record.
// Every refusal is the same not-found answer, so it never tells anyone
// whether a record exists.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; toolId: string }> }
) {
  const { projectId, toolId } = await params

  ensureToolsRegistered()

  const session = await requireSession()

  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  // A tool run once per payment milestone may name one cycle's record, such
  // as ?cycle=2 for the second milestone's D3.3.
  const cycle = z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .catch(undefined)
    .parse(request.nextUrl.searchParams.get("cycle") ?? undefined)

  let pdf

  try {
    pdf = await toolPdf(
      getDatabase(),
      session.user.id,
      projectId,
      toolId,
      cycle
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

  const download = request.nextUrl.searchParams.has("download")

  return pdfResponse(pdf, download ? "attachment" : "inline")
}
