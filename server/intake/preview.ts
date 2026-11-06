import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import { intakeSubmissions } from "@/db/schema"
import type { ClientRequest } from "@/lib/client-request"
import { rolesOn } from "@/server/permissions/permissions"

import { requestSheetOf } from "./request-sheet"

export type ClientRequestPreview = ClientRequest

// What the client filled in on the website form, from the ERM's saved copy of
// it. Only staff on the project, and a company-wide IT/Admin, may read it, so a
// client, a person on another project and a project that does not exist all get
// nothing. It only reads, and the answers hold client details, so nothing here
// puts them in a log or an error message.
export async function getClientRequestPreview(
  database: Database,
  actor: string,
  projectId: string
): Promise<ClientRequestPreview | null> {
  const held = await rolesOn(database, actor, projectId)

  if (!held.some((role) => role !== "Client")) {
    return null
  }

  const [copy] = await database
    .select()
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))

  if (!copy) {
    return null
  }

  return requestSheetOf(copy)
}
