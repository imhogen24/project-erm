import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import { intakeSubmissions, type Role } from "@/db/schema"
import type { ClientRequest } from "@/lib/client-request"
import { roleAllows, rolesOn } from "@/server/permissions/permissions"

import { requestSheetOf } from "./request-sheet"

export type ClientRequestPreview = ClientRequest

// The saved web request is D1.1, so whoever may read D1.1 reads it, wherever
// its answers are shown: the client who wrote it, and the OM, PM, CR and
// IT/Admin (server/permissions/matrix.ts).
export function mayReadRequest(held: Role[]) {
  return roleAllows(held, "D1.1", "read")
}

// What the client filled in on the web form, from the ERM's saved copy of it.
// A person who may not read D1.1, a person on another project and a project
// that does not exist all get nothing. It only reads, and the answers hold client details, so
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
