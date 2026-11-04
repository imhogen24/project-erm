import { z } from "zod"

import type { JsonObject } from "@/db/schema"

import type { FieldError } from "./validate"

// D1.1 is reviewed before it is approved: the OM marks the request and each
// file Reviewed, and the PM's approval marks them all Approved, which no
// person can choose. The keys are those of D1.1 in workbooks/wb01.
const reviewedTool = "D1.1"

const requestStatus = "requestStatus"

const attachedFiles = "attachedFiles"

const reviewed = "Reviewed"

const approved = "Approved"

const fileRows = z.array(z.looseObject({ status: z.string().optional() }))

function filesOf(payload: JsonObject) {
  return fileRows.parse(payload[attachedFiles] ?? [])
}

function pendingMessage(request: boolean, files: number): string {
  const counted = `${files} ${files === 1 ? "file" : "files"}`

  if (request && files > 0) {
    return `The request and ${counted} are still pending review`
  }

  if (request) {
    return "The request is still pending review"
  }

  return `${counted} ${files === 1 ? "is" : "are"} still pending review`
}

// What is left to review before the record may be approved. Only D1.1 has a
// review, and a file with no status has not been reviewed either.
export function pendingReview(
  toolId: string,
  payload: JsonObject
): FieldError[] {
  if (toolId !== reviewedTool) {
    return []
  }

  const request = payload[requestStatus] !== reviewed
  const files = filesOf(payload).filter((row) => row.status !== reviewed)

  if (!request && files.length === 0) {
    return []
  }

  return [
    {
      field: request ? requestStatus : attachedFiles,
      message: pendingMessage(request, files.length),
    },
  ]
}

// The payload as approval leaves it. Any other tool's is left as it is.
export function approvedPayload(
  toolId: string,
  payload: JsonObject
): JsonObject {
  if (toolId !== reviewedTool) {
    return payload
  }

  return {
    ...payload,
    [requestStatus]: approved,
    [attachedFiles]: filesOf(payload).map((row) => ({
      ...row,
      status: approved,
    })),
  }
}
