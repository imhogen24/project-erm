import { z } from "zod"

import type { JsonObject } from "@/db/schema"

import { ValidationError, type FieldError } from "./validate"

// D1.1 is reviewed before it is approved: the OM marks the request and each
// file Reviewed, and the PM's approval marks them all Approved, which no
// person can choose. The keys are those of D1.1 in workbooks/wb01.
const reviewedTool = "D1.1"

// Whether the tool is reviewed before it is approved.
export function hasReview(toolId: string): boolean {
  return toolId === reviewedTool
}

const requestStatus = "requestStatus"

const attachedFiles = "attachedFiles"

const reviewed = "Reviewed"

const approved = "Approved"

// What a person may choose. Approved is the system's, set when the PM approves.
const choosable = ["Pending", reviewed]

// The request, or a file by its place in the list (counted from 0), and the
// status to give it.
export type ReviewChange = { target: "request" | number; status: string }

const fileRows = z.array(z.looseObject({ status: z.string().optional() }))

const storedRows = z.array(z.record(z.string(), z.json()))

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

// The payload with one status switched. Only Pending and Reviewed can be
// chosen, and only on a tool that has a review.
export function withReviewStatus(
  toolId: string,
  payload: JsonObject,
  change: ReviewChange
): JsonObject {
  if (toolId !== reviewedTool) {
    throw new ValidationError([
      { field: toolId, message: "This tool has no review" },
    ])
  }

  const field = change.target === "request" ? requestStatus : attachedFiles

  if (!choosable.includes(change.status)) {
    throw new ValidationError([
      { field, message: `Must be one of: ${choosable.join(", ")}` },
    ])
  }

  if (change.target === "request") {
    return { ...payload, [requestStatus]: change.status }
  }

  const rows = storedRows.parse(payload[attachedFiles] ?? [])

  if (!rows[change.target]) {
    throw new ValidationError([
      {
        field,
        row: change.target,
        column: "status",
        message: "Not a file of this request",
      },
    ])
  }

  return {
    ...payload,
    [attachedFiles]: rows.map((row, index) =>
      index === change.target ? { ...row, status: change.status } : row
    ),
  }
}
