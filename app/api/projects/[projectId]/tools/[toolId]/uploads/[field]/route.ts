import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { uploadPdf } from "@/server/pdf/previews"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

// A PDF uploaded to a file field of the project's record of a tool, such as
// D2.12's executed contract, for a PDF preview of it. It shows in the page;
// `?download=1` saves it as a file instead. Every refusal is the same
// not-found answer, so it never tells anyone whether a file exists.
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; toolId: string; field: string }> }
) {
  const { projectId, toolId, field } = await params

  ensureToolsRegistered()

  const session = await requireSession()

  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  let pdf

  try {
    pdf = await uploadPdf(
      getDatabase(),
      session.user.id,
      projectId,
      toolId,
      field
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
