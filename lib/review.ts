import { z } from "zod"

// The statuses an OM may choose. Approved is the system's, set when the PM
// approves.
export const reviewChoices = ["Pending", "Reviewed"]

// The part of a D1.1 record the review screen shows. A missing or odd value
// reads as Pending, since that is what has not been reviewed.
export const reviewPayload = z.object({
  requestStatus: z.string().catch("Pending"),
  attachedFiles: z
    .array(
      z.object({
        label: z.string().catch(""),
        dateUploaded: z.string().catch(""),
        fileLink: z.string().catch(""),
        status: z.string().catch("Pending"),
      })
    )
    .catch([]),
})

export type ReviewPayload = z.infer<typeof reviewPayload>

export type ReviewFile = ReviewPayload["attachedFiles"][number]

// What a status switch or the submit says back.
export type ReviewResult =
  | { status: "done" }
  | { status: "invalid"; errors: { message: string }[] }
  | { status: "stale" }
  | { status: "error"; message: string }
