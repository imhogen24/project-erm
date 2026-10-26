"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureToolsRegistered } from "@/lib/tools"
import { requireSession } from "@/lib/session"
import {
  ChangeRequestNotAllowedError,
  ChangeRequestNotFoundError,
  ChangeRequestReasonMissingError,
  decideChange,
  requestChange,
  type ChangeRequest,
} from "@/server/change-requests/change-requests"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

const requestInput = z.object({
  recordId: z.uuid(),
  reason: z.string(),
})

const decisionInput = z.object({
  requestId: z.uuid(),
  outcome: z.enum(["approved", "rejected"]),
  reason: z.string(),
})

type RequestValues = z.infer<typeof requestInput>

// The outcome is any text here and checked against the two outcomes below.
type DecisionValues = {
  requestId: string
  outcome: string
  reason: string
}

export type ChangeResult =
  { status: "done" } | { status: "error"; message: string }

// The refusals the logic gives in its own words, which the screen shows next to
// the choice.
function refusal(error: Error): ChangeResult | undefined {
  if (
    error instanceof PermissionDeniedError ||
    error instanceof ChangeRequestNotAllowedError ||
    error instanceof ChangeRequestNotFoundError ||
    error instanceof ChangeRequestReasonMissingError ||
    error instanceof RecordNotFoundError
  ) {
    return { status: "error", message: error.message }
  }

  return undefined
}

// Typed for callers, but checked again here: an action can be called by anyone.
export async function requestChangeAction(
  values: RequestValues
): Promise<ChangeResult> {
  const session = await requireSession()
  const parsed = requestInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  ensureToolsRegistered()

  let changed: ChangeRequest

  try {
    changed = await requestChange(
      getDatabase(),
      session.user.id,
      parsed.data.recordId,
      parsed.data.reason
    )
  } catch (error) {
    const known = error instanceof Error ? refusal(error) : undefined

    if (known) {
      return known
    }

    throw error
  }

  // The project the change belongs to comes from the change itself, not from
  // anything the caller sent.
  revalidatePath(`/projects/${changed.projectId}`)

  return { status: "done" }
}

export async function decideChangeAction(
  values: DecisionValues
): Promise<ChangeResult> {
  const session = await requireSession()
  const parsed = decisionInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  ensureToolsRegistered()

  let changed: ChangeRequest

  try {
    changed = await decideChange(
      getDatabase(),
      session.user.id,
      parsed.data.requestId,
      parsed.data.outcome === "approved"
        ? { outcome: "approved" }
        : { outcome: "rejected", reason: parsed.data.reason }
    )
  } catch (error) {
    const known = error instanceof Error ? refusal(error) : undefined

    if (known) {
      return known
    }

    throw error
  }

  // The project the change belongs to comes from the change itself, not from
  // anything the caller sent.
  revalidatePath(`/projects/${changed.projectId}`)

  return { status: "done" }
}
