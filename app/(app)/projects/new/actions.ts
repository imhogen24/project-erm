"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ClientAnswers } from "@/lib/client-request-form"
import { requireSession } from "@/lib/session"
import { ensureToolsRegistered } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import {
  NotAClientError,
  startClientProject,
} from "@/server/intake/client-requests"
import { ValidationError } from "@/server/records/records"

const input = z.object({
  track: z.enum(["Tier_1", "Tier_3"]),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})

export type StartResult =
  | { status: "done"; path: string }
  | { status: "invalid"; errors: { field: string; message: string }[] }
  | { status: "error"; message: string }

// The client's Start new project. Checked again here: an action can be called
// by anyone.
export async function startProjectAction(values: {
  track: "Tier_1" | "Tier_3"
  answers: ClientAnswers
}): Promise<StartResult> {
  const parsed = input.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  const session = await requireSession()

  ensureToolsRegistered()

  try {
    const projectId = await startClientProject(
      getDatabase(),
      session.user.id,
      parsed.data.track,
      parsed.data.answers
    )

    revalidatePath("/")

    return { status: "done", path: `/projects/${projectId}` }
  } catch (error) {
    if (error instanceof ValidationError) {
      return { status: "invalid", errors: error.errors }
    }

    if (error instanceof NotAClientError) {
      return { status: "error", message: error.message }
    }

    throw error
  }
}
