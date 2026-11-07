import { cache } from "react"

import { getDatabase } from "@/server/database"
import { countProjectsNeedingTeam } from "@/server/staff/team"

// The sidebar and the mobile bar are both on the page, so this is asked once
// per request, not once per link. Only a company-wide IT/Admin may ask, and
// only they are ever shown the link that carries the number.
export const projectsWaitingForTeam = cache(async (personId: string) =>
  countProjectsNeedingTeam(getDatabase(), personId)
)
