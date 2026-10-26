"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  NotQualifiedError,
  ProjectNotFoundError,
  RoleTakenError,
  WorkloadLimitError,
  assignStaff,
  unassignStaff,
} from "@/server/staff/staff"

const input = z.object({
  projectId: z.uuid(),
  personId: z.uuid(),
  role: z.enum(["PM", "OM", "LE", "AE", "FO"]),
})

// The role is any text here and checked against the five team roles below.
type StaffValues = { projectId: string; personId: string; role: string }

export type StaffResult =
  { status: "done" } | { status: "error"; message: string }

// Typed for callers, but checked again here: an action can be called by anyone.
async function run(
  values: StaffValues,
  change: typeof assignStaff
): Promise<StaffResult> {
  const session = await requireSession()
  const parsed = input.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the choice and try again." }
  }

  try {
    await change(getDatabase(), session.user.id, parsed.data)
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof NotQualifiedError ||
      error instanceof ProjectNotFoundError ||
      error instanceof RoleTakenError ||
      error instanceof WorkloadLimitError
    ) {
      return { status: "error", message: error.message }
    }

    throw error
  }

  revalidatePath("/admin/team")
  revalidatePath(`/admin/team/${parsed.data.projectId}`)

  return { status: "done" }
}

export async function assignStaffAction(values: StaffValues) {
  return run(values, assignStaff)
}

export async function unassignStaffAction(values: StaffValues) {
  return run(values, unassignStaff)
}
