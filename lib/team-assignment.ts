import { z } from "zod"

import type { JsonObject } from "@/db/schema"

// D4.3, the team assignment and provisioning record, the third tool of
// Workbook 4, on Tier 1 only: the Lead Engineer sets the project's roster
// and the software and equipment each engineer needs, and the Head of
// Engineering signs it, which locks the team. Each rostered engineer then
// joins the project, and other projects' D4.2 read the roster as their
// booked days.

export const TEAM_ASSIGNMENT = "D4.3"

export const phaseInvolvements = [
  "Phase 1 Only",
  "Phase 2 Only",
  "Phase 3 Only",
  "Phases 1 & 2",
  "Phases 2 & 3",
  "All Phases",
]

export const provisioningStatuses = ["Pending", "Provisioned"]

const roster = z
  .object({
    roster: z
      .array(
        z
          .object({
            engineer: z.string().trim().optional().catch(undefined),
            days: z.number().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ roster: [] })

// The engineers a D4.3 rosters, in order, each once.
export function rosterEngineers(payload: JsonObject): string[] {
  return [
    ...new Set(
      roster
        .parse(payload)
        .roster.flatMap(({ engineer }) => (engineer ? [engineer] : []))
    ),
  ]
}

// Who a locked D4.3 books, and for how many days: each 2.0 row naming an
// engineer and their Allocated Days.
export function rosterBookings(
  payload: JsonObject
): { engineer: string; days: number }[] {
  return roster
    .parse(payload)
    .roster.flatMap(({ engineer, days }) =>
      engineer && days ? [{ engineer, days }] : []
    )
}
