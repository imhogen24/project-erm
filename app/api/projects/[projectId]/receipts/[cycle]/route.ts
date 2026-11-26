import { notFound } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import {
  ReceiptNotFoundError,
  paymentReceipt,
} from "@/server/payments/payment-receipt"
import { pdfResponse } from "@/server/pdf/pdf-response"
import { receiptPdf } from "@/server/pdf/receipt-pdf"
import { PermissionDeniedError } from "@/server/permissions/permissions"

// The payment receipt of one payment milestone cycle, as the client receives
// it, for anyone who may read D3.9: made from the locked D3.9 once it is
// sent. It shows in the page; `?download=1` saves it as
// IMHO_REC<YY>_<NNN>_<ClientName>.pdf. Every refusal is the same not-found
// answer, so it never tells anyone whether a receipt exists.
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

  let receipt

  try {
    receipt = await paymentReceipt(
      getDatabase(),
      session.user.id,
      projectId,
      cycle.data
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof ReceiptNotFoundError
    ) {
      notFound()
    }

    throw error
  }

  const download = request.nextUrl.searchParams.has("download")

  return pdfResponse(
    await receiptPdf(receipt),
    download ? "attachment" : "inline"
  )
}
