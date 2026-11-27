import { eq } from "drizzle-orm"
import { z } from "zod"

import { projects, type JsonObject } from "@/db/schema"
import { KICKOFF_INVITE } from "@/lib/kickoff-invite"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import type { Transaction } from "@/server/audit/audit"
import { holderOf, lockedPayload } from "@/server/handoff/handoff"
import { sourcedRows, tableRows } from "@/server/records/sourced-rows"

type Reader = Pick<Transaction, "select">

const invite = z
  .object({ meetingDate: z.string().optional().catch(undefined) })
  .catch({ meetingDate: undefined })

const roster = z
  .object({
    roster: z
      .array(
        z
          .object({
            role: z.string().trim().optional().catch(undefined),
            engineer: z.string().trim().optional().catch(undefined),
          })
          .catch({})
      )
      .catch([]),
  })
  .catch({ roster: [] })

const signed = z
  .object({
    pmSignature: z.object({ signedAt: z.string() }).optional().catch(undefined),
  })
  .catch({ pmSignature: undefined })

// Where D4.7 starts before the LE saves anything: Actual Meeting Date on
// D4.6's Meeting Date. The LE can change it.
export async function kickoffMinutesStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const { meetingDate } = invite.parse(
    await lockedPayload(database, projectId, KICKOFF_INVITE)
  )

  return meetingDate ? { actualDate: meetingDate } : {}
}

// What D4.7 shows that the system fills, read live: the request ID, the
// project's PM as Lead Facilitator, 2.0 on one row per row of D4.3's locked
// roster, 2.1, 2.2, with the engineer and their role and what the LE typed
// in it, then the attendees the LE added, and the day the PM signed.
export async function kickoffMinutesValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], leadFacilitator, assignment] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    holderOf(database, projectId, "PM"),
    lockedPayload(database, projectId, TEAM_ASSIGNMENT),
  ])

  const rostered = roster.parse(assignment).roster.map((row, index) => ({
    sn: `2.${index + 1}`,
    attendee: row.engineer ?? "",
    role: row.role ?? "",
  }))

  const signedAt = signed.parse(payload).pmSignature?.signedAt

  return {
    requestId: project?.requestId ?? "",
    leadFacilitator,
    attendance: sourcedRows(
      rostered,
      tableRows.parse(payload.attendance),
      "sn"
    ),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}
