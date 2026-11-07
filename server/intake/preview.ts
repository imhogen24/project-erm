import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import { intakeSubmissions, type Role } from "@/db/schema"
import type { ClientRequest } from "@/lib/client-request"
import { rolesOn } from "@/server/permissions/permissions"

import { requestSheetOf } from "./request-sheet"

export type ClientRequestPreview = ClientRequest

// Only staff on the project, and a company-wide IT/Admin, may read the saved
// web request, wherever its answers are shown.
export function mayReadRequest(held: Role[]) {
  return held.some((role) => role !== "Client")
}

// What the client filled in on the website form, from the ERM's saved copy of
// it. A client, a person on another project and a project that does not exist
// all get nothing. It only reads, and the answers hold client details, so
// nothing here puts them in a log or an error message.
export async function getClientRequestPreview(
  database: Database,
  actor: string,
  projectId: string
): Promise<ClientRequestPreview | null> {
  if (!mayReadRequest(await rolesOn(database, actor, projectId))) {
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
