import { eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  type JsonObject,
  type ServiceTrack,
} from "@/db/schema"
import type { ClientRequest } from "@/lib/client-request"
import { rolesOn } from "@/server/permissions/permissions"

export type ClientRequestPreview = ClientRequest & {
  serviceTrack: ServiceTrack
}

// The website's own bookkeeping and the file list. The files are opened from
// D1.1's Attached files, not read here.
const internalColumns = new Set([
  "custom_engineering_id",
  "drafting_digitization_id",
  "updated_at",
  "admin_notified_at",
  "confirmation_sent_at",
  "notify_attempts",
  "file_attachments",
  "file_attachment",
])

const NOT_GIVEN = "Not given"

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// "project_title" becomes "Project title".
function labelOf(column: string) {
  const words = column.replaceAll("_", " ")

  return words.charAt(0).toUpperCase() + words.slice(1)
}

const textList = z.array(z.string())

function valueOf(column: string, value: JsonObject[string]) {
  const list = textList.safeParse(value)

  if (list.success) {
    return list.data.length === 0 ? NOT_GIVEN : list.data.join(", ")
  }

  const text = z.string().safeParse(value)

  if (text.success && text.data === "") {
    return NOT_GIVEN
  }

  if (text.success && column.endsWith("_at")) {
    const date = new Date(text.data)

    return Number.isNaN(date.getTime()) ? text.data : `${when.format(date)} UTC`
  }

  if (text.success) {
    return text.data
  }

  return value === null || value === undefined
    ? NOT_GIVEN
    : JSON.stringify(value)
}

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

  return {
    requestId: copy.requestId,
    serviceTrack: copy.serviceTrack,
    answers: Object.entries(copy.submission)
      .filter(([column]) => !internalColumns.has(column))
      .map(([column, value]) => ({
        label: labelOf(column),
        value: valueOf(column, value),
      })),
  }
}
