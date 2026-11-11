import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  people,
  personCompanyRoles,
  projects,
  type JsonObject,
  type ServiceTrack,
} from "@/db/schema"

import { attachClientIn } from "@/server/accounts/accounts"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { sendEmail, type Transport } from "@/server/email/email"
import { notify } from "@/server/notifications/notifications"
import { createProjectIn } from "@/server/projects/projects"
import { createRecordIn, lockDraftIn } from "@/server/records/records"
import { systemActor } from "@/server/system/system"

import {
  copySubmission,
  findNewSubmissions,
  type WebsiteSubmission,
} from "./submissions"

// Request IDs only. A request's other details are the client's, so they are
// never in the summary or in a log.
export type IntakeSummary = {
  created: string[]
  skipped: string[]
  failed: string[]
}

// The address the client gave on the form. A request without one is still
// pulled in; it just matches no account.
const requestEmail = z.string().min(1)

export type IntakeOptions = {
  baseURL?: string
  transport?: Transport
}

type Admin = { id: string; email: string }

// What a request that became a project needs for the emails sent after it is
// saved.
export type Created = { projectId: string; admins: Admin[] }

// The file list's column is singular on Tier 3.
const fileColumn: Record<ServiceTrack, string> = {
  Tier_1: "file_attachments",
  Tier_3: "file_attachment",
}

const fileList = z.array(z.string())

function teamPath(projectId: string) {
  return `/admin/team/${projectId}`
}

// The columns a project's name comes from. Tier 3 has no title.
const nameColumns = z.object({
  organization_name: z.string().trim(),
  project_title: z.string().trim().optional(),
})

function projectName(submission: WebsiteSubmission): string {
  const { organization_name: organisation, project_title: title = "" } =
    nameColumns.parse(submission.row)

  const name =
    submission.serviceTrack === "Tier_1"
      ? title || organisation
      : organisation && `${organisation} - Drafting`

  return name || `Unnamed request ${submission.requestId}`
}

// One row per link, in the website's order. Each link is a plain UploadThing
// link with no name, type or size, and none is looked up.
function attachedFiles(submission: WebsiteSubmission): JsonObject[] {
  const links = fileList.parse(
    submission.row[fileColumn[submission.serviceTrack]]
  )

  const dateUploaded = submission.createdAt.toISOString().slice(0, 10)

  return links.map((link, index) => ({
    label: `File ${index + 1}`,
    dateUploaded,
    fileLink: link,
  }))
}

// Every company-wide IT/Admin.
export async function itAdmins(transaction: Transaction): Promise<Admin[]> {
  return transaction
    .select({ id: people.id, email: people.email })
    .from(personCompanyRoles)
    .innerJoin(people, eq(people.id, personCompanyRoles.personId))
    .where(eq(personCompanyRoles.role, "IT/Admin"))
    .orderBy(asc(people.id))
}

// Everything for one request, in the caller's transaction: the saved copy,
// the project, and D1.1, locked at once since the client has submitted it,
// which opens D1.2 for the OM. Nothing is created when the request ID already
// has a project, such as one made by hand: the copy is only linked to it.
export async function pullIn(
  transaction: Transaction,
  submission: WebsiteSubmission
): Promise<Created | undefined> {
  const copy = await copySubmission(transaction, submission)

  // Another run pulled it in first.
  if (copy.projectId) {
    return undefined
  }

  const [existing] = await transaction
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.requestId, submission.requestId))

  const project =
    existing ??
    (await createProjectIn(transaction, systemActor, {
      name: projectName(submission),
      serviceTrack: submission.serviceTrack,
      requestId: submission.requestId,
    }))

  await transaction
    .update(intakeSubmissions)
    .set({ projectId: project.id })
    .where(eq(intakeSubmissions.id, copy.id))

  if (existing) {
    return undefined
  }

  // The client's answers stay in the copy, which the D1.1 screen reads.
  const record = await createRecordIn(transaction, systemActor, {
    projectId: project.id,
    toolId: "D1.1",
    payload: { attachedFiles: attachedFiles(submission) },
  })

  await lockDraftIn(transaction, systemActor, record.id)

  const email = requestEmail.safeParse(submission.row.email)

  if (email.success) {
    await attachClientIn(transaction, project.id, email.data)
  }

  const admins = await itAdmins(transaction)

  await notify(transaction, {
    personIds: admins.map((admin) => admin.id),
    kind: "new_request",
    title: `New request ${submission.requestId}`,
    projectId: project.id,
    recordId: record.id,
    path: teamPath(project.id),
  })

  return { projectId: project.id, admins }
}

// Sent after the request is saved. The key is the request and the person, so a
// retry sends each email once, and a failed email leaves the project as it is.
export async function emailAdmins(
  database: Database,
  requestId: string,
  { projectId, admins }: Created,
  baseURL: string,
  transport: Transport | undefined
) {
  const link = `${baseURL.replace(/\/+$/, "")}${teamPath(projectId)}`

  for (const admin of admins) {
    try {
      await sendEmail(
        database,
        {
          to: admin.email,
          kind: "new_request",
          data: { requestId, link },
          projectId,
          key: `new_request:${requestId}:${admin.id}`,
        },
        transport
      )
    } catch {
      // Only an address that is not an email is refused, and nothing was sent.
    }
  }
}

// Turns each new website request into a project with a locked D1.1 listing
// the client's files, oldest first, and tells every IT/Admin. Each request is saved
// in its own transaction, so one that fails saves nothing, is reported by its
// request ID, and is tried again on the next run without holding up the rest.
// It only reads the website's tables.
export async function pullNewRequests(
  database: Database,
  { baseURL = requireEnv("BETTER_AUTH_URL"), transport }: IntakeOptions = {}
): Promise<IntakeSummary> {
  const summary: IntakeSummary = { created: [], skipped: [], failed: [] }

  for (const submission of await findNewSubmissions(database)) {
    let created: Created | undefined

    try {
      created = await database.transaction((transaction) =>
        pullIn(transaction, submission)
      )
    } catch {
      summary.failed.push(submission.requestId)

      continue
    }

    if (!created) {
      summary.skipped.push(submission.requestId)

      continue
    }

    summary.created.push(submission.requestId)

    await emailAdmins(
      database,
      submission.requestId,
      created,
      baseURL,
      transport
    )
  }

  return summary
}
