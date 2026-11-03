import { notFound } from "next/navigation"
import { NextResponse, type NextRequest } from "next/server"

import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { FileNotFoundError, fileLinkFor } from "@/server/files/files"

// Sends a person to a client file stored on a record. Every refusal is the same
// not-found answer, so it never tells anyone whether a record or a file exists.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const { recordId } = await params
  const session = await requireSession()
  const reference = request.nextUrl.searchParams.get("ref")

  if (!reference) {
    notFound()
  }

  let link

  try {
    link = await fileLinkFor(
      getDatabase(),
      session.user.id,
      recordId,
      reference
    )
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      notFound()
    }

    throw error
  }

  return NextResponse.redirect(link)
}
