import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  intakeSubmissions,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { assertCan } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ProjectNotActiveError,
  RecordNotFoundError,
  ValidationError,
  lockSentDraft,
  type ToolRecord,
} from "@/server/records/records"

export const ACKNOWLEDGEMENT = "D1.4"

// The delivery status set when the email goes out: the first option of D1.4's
// deliveryStatus (workbooks/wb01/tools/d1-4.ts; a test keeps them the same).
export const SENT = "Sent"

// D1.4 cannot be sent yet. Each entry says what is missing.
export class SendNotReadyError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`It cannot be sent yet: ${missing.join(", ")}`)
    this.missing = missing
  }
}

// The email service did not take the email. Nothing was marked sent, so the
// PM can press Send again.
export class EmailRefusedError extends Error {}

export type AcknowledgementDraft = {
  // The client's email from the saved web request, or null when it has none.
  sentTo: string | null
  // The project's Onboarding Manager, the IMHOGEN rep the email comes from,
  // or null when the project has none. The email itself always goes from the
  // noreply address.
  sentBy: string | null
  subject: string
  body: string
}

const submissionSchema = z.object({
  contact_person: z.string().optional(),
  email: z.string().optional(),
  project_title: z.string().optional(),
  created_at: z.string().optional(),
})

// The sheet's own placeholders, left in the text where the web request does
// not hold a value, so the OM sees the blank and fills it.
const blank = {
  name: "[Client Name]",
  title: "[Project/Product Name]",
  date: "[Date of Submission]",
}

// "Thursday, Aug 6, 2026 at 11:50 AM", as in the reviewed wireframe. Ghana
// keeps GMT all year, so UTC is the client's own time.
function submittedOn(iso: string | undefined) {
  const at = iso ? new Date(iso) : undefined

  if (!at || Number.isNaN(at.getTime())) {
    return blank.date
  }

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(at)

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(at)

  return `${day} at ${time}`
}

// The standard template from the sheet (docs/dev_docs/WORKBOOK_01, D1.4), with
// the web request's values filled in. The sheet's sentence about measuring a
// physical product is for one kind of project, so the OM adds it when needed.
export function draftFrom(input: {
  contact?: string
  title?: string
  submittedAt?: string
  requestId: string
}): Pick<AcknowledgementDraft, "subject" | "body"> {
  const title = input.title?.trim() || blank.title

  return {
    subject: `Acknowledgement of ${title} request`,
    body: [
      `Dear ${input.contact?.trim() || blank.name},`,
      `Thank you for reaching out to IMHOGEN LTD. We have successfully received your project inquiry regarding ${title} submitted on ${submittedOn(input.submittedAt)}.`,
      `Your request has been assigned the tracking reference: ${input.requestId}.`,
      "Our Engineering and R&D team is currently reviewing the initial details you provided. A Project Onboarding Manager will contact you within the next 24-48 hours to propose a time for a brief Technical Discovery Meeting. This meeting will help us better understand your specific technical requirements and operational constraints to ensure we can deliver the optimal engineering solution.",
      "We look forward to collaborating with you.",
      "Best regards",
    ].join("\n\n"),
  }
}

// What D1.4 starts from on this project: the client's email, and the subject
// and body filled in from the saved web request. A Tier 3 request has no
// project title, so the project's name stands in for it.
export async function acknowledgementDraft(
  database: Pick<Database, "select">,
  projectId: string
): Promise<AcknowledgementDraft> {
  const [row] = await database
    .select({
      name: projects.name,
      requestId: projects.requestId,
      serviceTrack: projects.serviceTrack,
      submission: intakeSubmissions.submission,
    })
    .from(projects)
    .leftJoin(intakeSubmissions, eq(intakeSubmissions.projectId, projects.id))
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!row) {
    throw new RecordNotFoundError(`No project with id ${projectId}`)
  }

  const request = submissionSchema.safeParse(row.submission ?? {}).data ?? {}
  const email = z.email().safeParse(request.email?.trim())

  const [om] = await database
    .select({ email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, projectId),
        eq(personProjectRoles.role, "OM")
      )
    )
    .orderBy(asc(people.name))
    .limit(1)

  return {
    sentTo: email.success ? email.data : null,
    sentBy: om?.email ?? null,
    ...draftFrom({
      contact: request.contact_person,
      title: row.serviceTrack === "Tier_1" ? request.project_title : row.name,
      submittedAt: request.created_at,
      requestId: row.requestId,
    }),
  }
}

const text = z.string().trim().min(1)

// The parts of a saved D1.4 that Send reads.
const sendable = z.object({
  sentTo: z.email().optional(),
  sentBy: z.email().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  ccBcc: z.string().optional(),
})

export type SendableEmail = z.infer<typeof sendable>

export function sendableOf(payload: JsonObject): SendableEmail {
  return sendable.safeParse(payload).data ?? {}
}

// What still stops D1.4 being sent, in the words the Send button shows.
export function missingToSend(
  sentTo: string | null,
  payload: SendableEmail
): string[] {
  const missing: string[] = []

  if (!sentTo) {
    missing.push("the client's email is missing from the web request")
  }

  if (!text.safeParse(payload.subject).success) {
    missing.push("add a subject line")
  }

  if (!text.safeParse(payload.body).success) {
    missing.push("add the email text")
  }

  return missing
}

// "a@x.com, b@y.com" becomes two addresses. A bad one is refused with a
// message for the field, before anything is sent.
export function copiedAddresses(value: string | undefined): string[] {
  const parts = (value ?? "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== "")

  const bad = parts.filter((part) => !z.email().safeParse(part).success)

  if (bad.length > 0) {
    throw new ValidationError([
      {
        field: "ccBcc",
        message: `Not an email address: ${bad.join(", ")}`,
      },
    ])
  }

  return parts
}

// The PM's Send on D1.4: emails the client, copying the CC / BCC addresses,
// then records who sent it and when and locks D1.4. The record's ID is the
// email's key, so pressing twice sends once. When the email service refuses,
// nothing is marked sent and D1.4 stays a draft to send again.
export async function sendAcknowledgement(
  database: Database,
  actor: string,
  recordId: string,
  transport: Transport = getTransport()
): Promise<ToolRecord> {
  const [record] = await database
    .select({
      projectId: toolRecords.projectId,
      toolId: toolRecords.toolId,
      state: toolRecords.state,
      payload: toolRecords.payload,
      projectStatus: projects.status,
    })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== ACKNOWLEDGEMENT) {
    throw new RecordNotFoundError(`No ${ACKNOWLEDGEMENT} record ${recordId}`)
  }

  await assertCan(database, actor, record.projectId, ACKNOWLEDGEMENT, "approve")

  if (record.state !== "draft" && record.state !== "locked") {
    throw new InvalidTransitionError(`A ${record.state} record cannot be sent`)
  }

  const { sentTo, sentBy } = await acknowledgementDraft(
    database,
    record.projectId
  )

  if (record.state === "draft") {
    // Checked before the email goes, as well as when D1.4 is locked: an email
    // sent from a project on hold could not then be recorded.
    if (record.projectStatus !== "active") {
      throw new ProjectNotActiveError(
        `This project is ${record.projectStatus.replace("_", " ")}, so nothing can be sent`
      )
    }

    const email = sendableOf(record.payload)
    const missing = missingToSend(sentTo, email)

    if (missing.length > 0 || !sentTo) {
      throw new SendNotReadyError(missing)
    }

    const cc = copiedAddresses(email.ccBcc)

    const sent = await sendEmail(
      database,
      {
        to: sentTo,
        cc,
        kind: "acknowledgement",
        data: {
          subject: email.subject!.trim(),
          body: email.body!,
        },
        projectId: record.projectId,
        recordId,
        key: `acknowledgement:${recordId}`,
      },
      transport
    )

    if (sent.status === "failed") {
      throw new EmailRefusedError(
        `The email service did not send it: ${sent.error ?? "no reason given"}. Press Send to try again.`
      )
    }

    if (sent.status === "queued") {
      throw new EmailRefusedError(
        "This email is already being sent. Reload the page in a moment."
      )
    }

    const at = sent.updatedAt.toISOString()

    return lockSentDraft(database, actor, recordId, {
      sentTo,
      ...(sentBy && { sentBy }),
      dateSent: at.slice(0, 10),
      timeSent: at.slice(11, 16),
      deliveryStatus: SENT,
    })
  }

  return lockSentDraft(database, actor, recordId, {})
}
