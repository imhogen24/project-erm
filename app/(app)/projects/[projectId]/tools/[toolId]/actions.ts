"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureToolsRegistered } from "@/lib/tools"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotEditableError,
  RecordNotFoundError,
  SelfApprovalError,
  StaleRecordError,
  ToolNotAvailableError,
  ValidationError,
  approveRecord,
  saveDraft,
  signField,
  submitRecord,
  type ToolRecord,
} from "@/server/records/records"
import type { FieldError } from "@/server/records/validate"

const saveInput = z.object({
  projectId: z.uuid(),
  toolId: z.string().min(1),
  cycle: z.number().int().min(1),
  values: z.record(z.string(), z.json()),
  // The `updatedAt` of the record the screen opened, as text, or left out when
  // the tool had no record yet.
  expectedUpdatedAt: z.string().optional(),
})

const recordInput = z.object({ recordId: z.uuid() })

const signInput = z.object({ recordId: z.uuid(), fieldKey: z.string().min(1) })

type SaveValues = {
  projectId: string
  toolId: string
  cycle: number
  values: z.infer<typeof saveInput>["values"]
  expectedUpdatedAt?: string
}

// `record` carries the saved record, so the screen keeps the time to save over.
// `invalid` is a refusal of what was typed, with a message for each field.
export type RecordResult =
  | { status: "done"; recordId: string; updatedAt: string }
  | {
      status: "invalid"
      errors: FieldError[]
      recordId?: string
      updatedAt?: string
    }
  | { status: "stale" }
  | { status: "error"; message: string }

function done(record: ToolRecord): RecordResult {
  return {
    status: "done",
    recordId: record.id,
    updatedAt: record.updatedAt.toISOString(),
  }
}

// The refusals the logic gives in its own words.
function refusal(error: Error): RecordResult | undefined {
  if (error instanceof StaleRecordError) {
    return { status: "stale" }
  }

  if (error instanceof ValidationError) {
    return { status: "invalid", errors: error.errors }
  }

  if (
    error instanceof PermissionDeniedError ||
    error instanceof RecordNotEditableError ||
    error instanceof RecordNotFoundError ||
    error instanceof InvalidTransitionError ||
    error instanceof SelfApprovalError ||
    error instanceof ToolNotAvailableError ||
    error instanceof ProjectNotActiveError
  ) {
    return { status: "error", message: error.message }
  }

  return undefined
}

async function attempt(
  run: (actor: string) => Promise<RecordResult>
): Promise<RecordResult> {
  const session = await requireSession()

  ensureToolsRegistered()

  try {
    const result = await run(session.user.id)

    // The overview shows each tool's state, and this page shows the record.
    revalidatePath("/projects/[projectId]", "page")
    revalidatePath("/projects/[projectId]/tools/[toolId]", "page")

    return result
  } catch (error) {
    const known = error instanceof Error ? refusal(error) : undefined

    if (known) {
      return known
    }

    throw error
  }
}

function checked(values: SaveValues) {
  const parsed = saveInput.safeParse(values)

  return parsed.success ? parsed.data : undefined
}

// Typed for callers, but checked again here: an action can be called by anyone.
export async function saveDraftAction(
  values: SaveValues
): Promise<RecordResult> {
  const input = checked(values)

  if (!input) {
    return { status: "error", message: "Check the form and try again." }
  }

  return attempt(async (actor) =>
    done(
      await saveDraft(getDatabase(), actor, {
        projectId: input.projectId,
        toolId: input.toolId,
        cycle: input.cycle,
        values: input.values,
        expectedUpdatedAt: input.expectedUpdatedAt
          ? new Date(input.expectedUpdatedAt)
          : undefined,
      })
    )
  )
}

// Saves the form, then sends the record for approval. When the form is not
// complete the draft stays saved and the problems go back for the fields.
export async function submitRecordAction(
  values: SaveValues
): Promise<RecordResult> {
  const input = checked(values)

  if (!input) {
    return { status: "error", message: "Check the form and try again." }
  }

  return attempt(async (actor) => {
    const saved = await saveDraft(getDatabase(), actor, {
      projectId: input.projectId,
      toolId: input.toolId,
      cycle: input.cycle,
      values: input.values,
      expectedUpdatedAt: input.expectedUpdatedAt
        ? new Date(input.expectedUpdatedAt)
        : undefined,
    })

    try {
      return done(await submitRecord(getDatabase(), actor, saved.id))
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          status: "invalid",
          errors: error.errors,
          recordId: saved.id,
          updatedAt: saved.updatedAt.toISOString(),
        }
      }

      throw error
    }
  })
}

export async function signFieldAction(values: {
  recordId: string
  fieldKey: string
}): Promise<RecordResult> {
  const parsed = signInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  const input = parsed.data

  return attempt(async (actor) =>
    done(await signField(getDatabase(), actor, input.recordId, input.fieldKey))
  )
}

export async function approveRecordAction(values: {
  recordId: string
}): Promise<RecordResult> {
  const parsed = recordInput.safeParse(values)

  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again." }
  }

  const input = parsed.data

  return attempt(async (actor) => {
    try {
      return done(await approveRecord(getDatabase(), actor, input.recordId))
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          status: "error",
          message: `It cannot be approved yet: ${error.errors.map((each) => each.message).join(", ")}`,
        }
      }

      throw error
    }
  })
}
