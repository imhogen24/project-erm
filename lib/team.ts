import { cache } from "react"

import { getDatabase } from "@/server/database"
import { projectsNeedingTeam } from "@/server/staff/team"

// The projects still short of a PM or an OM, asked once per request: the
// sidebar's count and list and the top bar's count all read this, so one page
// costs one query. Only a company-wide IT/Admin may ask. From RDP-127.
export const projectsWaitingForTeam = cache(async (personId: string) =>
  projectsNeedingTeam(getDatabase(), personId)
)
