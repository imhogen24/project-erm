import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { recordPdf } from "@/server/pdf/record-pdf"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

// Downloads a tool record as a PDF. Every refusal is the same not-found answer
// as opening the tool, so it never tells anyone whether a record exists.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const { recordId } = await params

  // The PDF walks the record's tool definition, so the tools must be in the
  // registry before the first lookup.
  ensureToolsRegistered()

  const session = await requireSession()

  if (!z.uuid().safeParse(recordId).success) {
    notFound()
  }

  let pdf

  try {
    pdf = await recordPdf(getDatabase(), session.user.id, recordId)
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof RecordNotFoundError
    ) {
      notFound()
    }

    throw error
  }

  // The plain name keeps to ASCII for old browsers; filename* holds it whole.
  const ascii = pdf.fileName.replaceAll(/[^\x20-\x7e]/g, "_")

  return new Response(new Uint8Array(pdf.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(pdf.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  })
}
