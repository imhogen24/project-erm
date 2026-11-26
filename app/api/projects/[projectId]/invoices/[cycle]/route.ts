import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import {
  InvoiceNotFoundError,
  approvedInvoice,
} from "@/server/payments/approved-invoice"
import { invoicePdf } from "@/server/pdf/invoice-pdf"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { PermissionDeniedError } from "@/server/permissions/permissions"

// The approved invoice of one payment milestone cycle, as the client receives
// it, for anyone who may read D3.5: made from the locked D3.4 once D3.5 is
// approved. It shows in the page; `?download=1` saves it as
// IMHO_INV<YY>_<NNN>_<ClientName>.pdf. Every refusal is the same not-found
// answer, so it never tells anyone whether an invoice exists.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; cycle: string }> }
) {
  const { projectId, cycle: named } = await params

  ensureToolsRegistered()

  const session = await requireSession()

  const cycle = z.coerce.number().int().min(1).safeParse(named)

  if (!z.uuid().safeParse(projectId).success || !cycle.success) {
    notFound()
  }

  let invoice

  try {
    invoice = await approvedInvoice(
      getDatabase(),
      session.user.id,
      projectId,
      cycle.data
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof InvoiceNotFoundError
    ) {
      notFound()
    }

    throw error
  }

  const download = request.nextUrl.searchParams.has("download")

  return pdfResponse(
    await invoicePdf(invoice),
    download ? "attachment" : "inline"
  )
}
