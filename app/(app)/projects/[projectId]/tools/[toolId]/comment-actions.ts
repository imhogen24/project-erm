"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import {
  CommentBodyMissingError,
  CommentNotFoundError,
  addComment,
  resolveComment,
} from "@/server/comments/comments"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError } from "@/server/records/records"

export type CommentResult =
  { status: "done" } | { status: "error"; message: string }

const commentInput = z.object({
  recordId: z.uuid(),
  body: z.string().max(5000),
  parentId: z.uuid().optional(),
})

const resolveInput = z.object({ commentId: z.uuid() })

// Runs one comment step as the signed-in person. A refusal comes back in the
// logic's own words; anything else is a fault and is thrown.
async function attempt(
  run: (actor: string) => Promise<void>
): Promise<CommentResult> {
  const session = await requireSession()

  ensureToolsRegistered()

  try {
    await run(session.user.id)
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof CommentBodyMissingError ||
      error instanceof CommentNotFoundError ||
      error instanceof RecordNotFoundError
    ) {
      return { status: "error", message: error.message }
    }

    throw error
  }

  revalidatePath("/projects/[projectId]/tools/[toolId]", "page")

  return { status: "done" }
}

// A comment on a tool's record, or a reply to one.
export async function addCommentAction(values: {
  recordId: string
  body: string
  parentId?: string
}): Promise<CommentResult> {
  const parsed = commentInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the comment and try again." }
  }

  return attempt(async (actor) => {
    await addComment(getDatabase(), actor, parsed.data)
  })
}

// Marks a comment, and its replies, as resolved.
export async function resolveCommentAction(values: {
  commentId: string
}): Promise<CommentResult> {
  const parsed = resolveInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Reload and try again." }
  }

  return attempt((actor) =>
    resolveComment(getDatabase(), actor, parsed.data.commentId)
  )
}
