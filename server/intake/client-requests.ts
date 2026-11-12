import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  people,
  personProjectRoles,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import {
  schemaFor,
  type ClientAnswers,
  type Tier,
} from "@/lib/client-request-form"
import { requireEnv } from "@/server/database"
import type { Transport } from "@/server/email/email"
import { attachedFilesIn } from "@/server/files/uploads"
import { assertCan } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  ValidationError,
  lockDraftIn,
} from "@/server/records/records"

import { emailAdmins, pullIn } from "./intake"

const prefix: Record<Tier, string> = { Tier_1: "T1", Tier_3: "T3" }

const answerValue = z.union([z.string(), z.array(z.string())])

// A client made their own account at /sign-up. Only a client starts a project.
export async function isClientAccount(
  database: Pick<Database, "select">,
  personId: string
): Promise<boolean> {
  const [person] = await database
    .select({ accountType: people.accountType })
    .from(people)
    .where(eq(people.id, personId))

  return person?.accountType === "client"
}

// The answers checked against the web form's rules, or the messages for each
// question, under its column.
function checked(track: Tier, answers: ClientAnswers): JsonObject {
  const result = schemaFor[track].safeParse(answers)

  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: String(issue.path[0] ?? "form"),
        message: issue.message,
      }))
    )
  }

  return result.data
}

export class NotAClientError extends Error {}

// A client starts a project from the ERM: the answers are saved as the website
// saves them, the project and a locked D1.1 are made as for a website request
// (which opens D1.2 for the OM), the client is put on the project, and every
// IT/Admin is told. The files are the client's uploads, as `file:<id>`, which
// go on D1.1. Returns the new project's ID.
export async function startClientProject(
  database: Database,
  clientId: string,
  track: Tier,
  answers: ClientAnswers,
  options: {
    files?: string[]
    baseURL?: string
    transport?: Transport
  } = {}
): Promise<string> {
  if (!(await isClientAccount(database, clientId))) {
    throw new NotAClientError("Only a client starts a project here")
  }

  const row = checked(track, answers)
  const now = new Date()
  const requestId = `${prefix[track]}-${now.getTime()}`

  const created = await database.transaction(async (transaction) => {
    const made = await pullIn(
      transaction,
      {
        requestId,
        serviceTrack: track,
        createdAt: now,
        row: {
          ...row,
          request_id: requestId,
          created_at: now.toISOString(),
          terms_accepted_at: now.toISOString(),
          [track === "Tier_1" ? "file_attachments" : "file_attachment"]: [],
        },
      },
      (projectId) =>
        attachedFilesIn(transaction, clientId, projectId, options.files ?? [])
    )

    if (!made) {
      throw new InvalidTransitionError("This request was already started")
    }

    await transaction
      .insert(personProjectRoles)
      .values({ personId: clientId, projectId: made.projectId, role: "Client" })
      .onConflictDoNothing()

    return made
  })

  await emailAdmins(
    database,
    requestId,
    created,
    options.baseURL ?? requireEnv("BETTER_AUTH_URL"),
    options.transport
  )

  return created.projectId
}

const fileRows = z.object({
  attachedFiles: z.array(z.record(z.string(), z.json())).catch([]),
})

// After a change request on D1.1 is approved, D1.1 is a draft again and the
// client sends the form once more: the saved answers are replaced, the files
// become the ones they kept and added, and D1.1 locks at once, which also
// closes the change request.
export async function resubmitClientRequest(
  database: Database,
  actor: string,
  projectId: string,
  answers: ClientAnswers,
  files: string[]
): Promise<void> {
  await assertCan(database, actor, projectId, "D1.1", "write")

  await database.transaction(async (transaction) => {
    const [copy] = await transaction
      .select({
        id: intakeSubmissions.id,
        track: intakeSubmissions.serviceTrack,
        submission: intakeSubmissions.submission,
      })
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.projectId, projectId))
      .limit(1)

    const [record] = await transaction
      .select({
        id: toolRecords.id,
        state: toolRecords.state,
        payload: toolRecords.payload,
      })
      .from(toolRecords)
      .where(
        and(
          eq(toolRecords.projectId, projectId),
          eq(toolRecords.toolId, "D1.1"),
          ne(toolRecords.state, "void")
        )
      )
      .limit(1)

    if (!copy || !record) {
      throw new RecordNotFoundError("This project has no web form")
    }

    if (record.state !== "draft") {
      throw new InvalidTransitionError(
        "The web form can only be changed once a change request is approved"
      )
    }

    await transaction
      .update(intakeSubmissions)
      .set({
        submission: { ...copy.submission, ...checked(copy.track, answers) },
      })
      .where(eq(intakeSubmissions.id, copy.id))

    const attachedFiles = await attachedFilesIn(
      transaction,
      actor,
      projectId,
      files,
      fileRows.parse(record.payload).attachedFiles
    )

    await lockDraftIn(transaction, actor, record.id, { attachedFiles })
  })
}

// What the client sent, as they typed it, to fill the form again when they
// change it after a change request. Only for whoever may write D1.1.
export async function clientAnswersOf(
  database: Database,
  actor: string,
  projectId: string
): Promise<{ track: Tier; answers: ClientAnswers } | null> {
  await assertCan(database, actor, projectId, "D1.1", "write")

  const [copy] = await database
    .select({
      track: intakeSubmissions.serviceTrack,
      submission: intakeSubmissions.submission,
    })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  if (!copy) {
    return null
  }

  // The website's own columns, such as the request ID and the times, are
  // dropped: they are not answers.
  const answers: ClientAnswers = {}

  for (const [column, value] of Object.entries(copy.submission)) {
    const answer = answerValue.safeParse(value)

    if (answer.success) {
      answers[column] = answer.data
    }
  }

  return { track: copy.track, answers }
}
