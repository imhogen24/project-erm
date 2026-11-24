import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { storedPdf } from "@/server/pdf/previews"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

// A PDF kept with the app, such as the company SLA, for a PDF preview field
// on a tool of this project. It shows in the page; `?download=1` saves it as
// a file instead. Anyone no tool shows it to gets not found.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; file: string }> }
) {
  const { projectId, file } = await params

  ensureToolsRegistered()

  const session = await requireSession()

  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  let pdf

  try {
    pdf = await storedPdf(getDatabase(), session.user.id, projectId, file)
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
