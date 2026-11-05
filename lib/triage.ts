import { z } from "zod"

// The two decisions the workflow reads. Tier 3 shows the first as "Proceed to
// D1.3a", but both tiers store the same option.
export const PROCEED = "Proceed to D1.3"

export const REJECT = "Reject as Spam"

export const checkStatuses = ["Pass", "Fail"]

// The part of a D1.2 record the triage screen shows and sends. A missing or odd
// value reads as empty, since that is what has not been answered.
export const triagePayload = z.object({
  digitalRecords: z
    .array(z.object({ fileName: z.string().catch("") }))
    .catch([]),
  triageChecklist: z
    .array(
      z.object({
        status: z.string().catch(""),
        reviewerNotes: z.string().catch(""),
      })
    )
    .catch([]),
  triageDecision: z.string().catch(""),
})

export type TriageValues = z.infer<typeof triagePayload>
