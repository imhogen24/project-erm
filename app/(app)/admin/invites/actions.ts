"use server"

import { z } from "zod"

import { requireSession } from "@/lib/session"
import { getDatabase, requireEnv } from "@/server/database"
import { InvalidInviteInputError, createInvite } from "@/server/invites/invites"
import { PermissionDeniedError } from "@/server/permissions/permissions"

const input = z.object({
  email: z.string(),
  name: z.string(),
  projectId: z.uuid(),
  roles: z.array(z.string()),
})

type InviteValues = z.infer<typeof input>

export type InviteResult =
  | { status: "invited"; link: string }
  | { status: "added"; email: string }
  | { status: "error"; message: string }

// Typed for callers, but checked again here: an action can be called by anyone.
export async function createInviteAction(
  values: InviteValues
): Promise<InviteResult> {
  const session = await requireSession()
  const parsed = input.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  try {
    const created = await createInvite(
      getDatabase(),
      session.user.id,
      parsed.data,
      { baseURL: requireEnv("BETTER_AUTH_URL") }
    )

    if (created.status === "added") {
      return { status: "added", email: parsed.data.email.trim().toLowerCase() }
    }

    return { status: "invited", link: created.link }
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof InvalidInviteInputError
    ) {
      return { status: "error", message: error.message }
    }

    throw error
  }
}
