import { and, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  emailLog,
  files,
  intakeSubmissions,
  notifications,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { fileIdOf } from "@/lib/file-reference"
import {
  DIGITAL,
  OVERDUE_DAYS,
  PENDING,
  REMINDER_DAYS,
  SIGNATURE_CONTRACT,
  SIGNED,
  signatureScriptFor,
  signatureSubjectFor,
  signingPath,
} from "@/lib/signature-contract"
import {
  EmailRefusedError,
  SendNotReadyError,
} from "@/server/acknowledgement/acknowledgement"
import type { Transaction } from "@/server/audit/audit"
import { namesOf } from "@/server/contract/transmittal"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { storages, type Storages } from "@/server/files/storage"
import { holderOf } from "@/server/handoff/handoff"
import { notify } from "@/server/notifications/notifications"
import { assertCan } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  askNextSignature,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

export { EmailRefusedError, SendNotReadyError }

type Reader = Pick<Transaction, "select">

const DAY = 24 * 60 * 60 * 1000

const signature = z
  .object({ signedBy: z.string(), signedAt: z.string() })
  .optional()
  .catch(undefined)

const text = z.string().optional().catch(undefined)

// The parts of a saved D2.11 that sending, the tracker and the reminders read.
const saved = z.object({
  routingMethod: text,
  sentTo: text,
  autoReminder: text,
  finalContract: text,
  script: text,
  dateDispatched: text,
  dispatchedAt: text,
  dispatchConfirmed: text,
  signatories: z
    .array(z.object({ status: text }).catch({ status: undefined }))
    .catch([]),
  clientViewedAt: text,
  heViewedAt: text,
  clientSignature: signature,
  heSignature: signature,
})

type Saved = z.infer<typeof saved>

function savedOf(payload: JsonObject): Saved {
  return saved.parse(payload)
}

const request = z
  .object({
    contact_person: z.string().optional().catch(undefined),
    email: z.string().optional().catch(undefined),
  })
  .catch({})

// The client contact on the project's web request.
async function contactOf(database: Reader, projectId: string) {
  const [row] = await database
    .select({ submission: intakeSubmissions.submission })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.projectId, projectId))
    .limit(1)

  const { contact_person: name, email } = request.parse(row?.submission ?? {})

  return { name: name?.trim() ?? "", email: email?.trim() ?? "" }
}

// The first email address in Sent To, such as "Ama Mensah ama@client.com".
export function addressIn(sentTo: string | undefined): string | undefined {
  return (sentTo ?? "")
    .split(/[\s<>(),;]+/)
    .find((word) => z.email().safeParse(word).success)
}

function dayOf(at: string | undefined) {
  return at ? at.slice(0, 10) : undefined
}

// Where D2.11 starts before the CA saves anything: signing in the app, the
// client contact and the project's HE as signatories, and the sheet's script
// with the client and the CA named. The CA can change each until it is sent.
export async function signatureStart(
  database: Reader,
  projectId: string,
  writer: string
): Promise<JsonObject> {
  const [{ clientName }, contact, he] = await Promise.all([
    namesOf(database, projectId),
    contactOf(database, projectId),
    holderOf(database, projectId, "HE"),
  ])

  return {
    routingMethod: DIGITAL,
    sentTo: [contact.name, contact.email].filter(Boolean).join(" "),
    imhogenSignatory: he ? `${he}, Head of Engineering` : "",
    script: signatureScriptFor(clientName, writer, DIGITAL),
  }
}

// The names 3.0's fixed rows show: the client contact, or the client, and
// the project's HE.
export async function signatureFills(
  database: Reader,
  projectId: string
): Promise<Record<string, string>> {
  const [{ clientName }, contact, he] = await Promise.all([
    namesOf(database, projectId),
    contactOf(database, projectId),
    holderOf(database, projectId, "HE"),
  ])

  return {
    "Client Name": contact.name || clientName,
    "IMHOGEN Rep": he || "Head of Engineering",
  }
}

// When the email service took the contract, which starts the wait for
// signatures. A Send cut short and finished later counts from then.
function sentAt(values: Saved) {
  const at = Date.parse(values.dispatchConfirmed ?? "")

  return Number.isNaN(at) ? undefined : at
}

// Both sides have signed: in the app, or, for Physical Courier, both rows
// of 3.0 recorded as Signed.
function fullySigned(values: Saved) {
  if (values.routingMethod === DIGITAL) {
    return (
      values.clientSignature !== undefined && values.heSignature !== undefined
    )
  }

  return (
    values.signatories.length >= 2 &&
    values.signatories.every((row) => row.status === SIGNED)
  )
}

// Whether the contract has waited for signature more than 7 days.
function overdue(values: Saved, now: Date) {
  const at = sentAt(values)

  return (
    at !== undefined &&
    !fullySigned(values) &&
    now.getTime() - at >= OVERDUE_DAYS * DAY
  )
}

// What D2.11 shows that the system fills, read live: the request ID, whether
// it is 7 days unsigned, and, when signed in the app, 3.0 as each side views
// and signs.
export async function signatureValues(
  database: Reader,
  projectId: string,
  payload: JsonObject,
  now = new Date()
): Promise<JsonObject> {
  const [project] = await database
    .select({ requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const values = savedOf(payload)

  const row = (viewed: string | undefined, signed: Saved["heSignature"]) => ({
    ...(dayOf(viewed) && { dateViewed: dayOf(viewed)! }),
    ...(signed && { dateSigned: dayOf(signed.signedAt)! }),
    status: signed ? SIGNED : PENDING,
  })

  return {
    requestId: project?.requestId ?? "",
    overdue: overdue(values, now) ? "Yes" : "No",
    ...(values.routingMethod === DIGITAL && {
      signatories: [
        row(values.clientViewedAt, values.clientSignature),
        row(values.heViewedAt, values.heSignature),
      ],
    }),
  }
}

type FinalFile = {
  key: string
  name: string
  contentType: string
  storage: "uploadthing"
}

// The uploaded final contract, if Final Contract PDF holds one on the project.
async function finalFileOf(
  database: Reader,
  projectId: string,
  reference: string | undefined
): Promise<FinalFile | undefined> {
  const id = fileIdOf(reference ?? "")

  if (!id) {
    return undefined
  }

  const [file] = await database
    .select({
      key: files.key,
      name: files.name,
      contentType: files.contentType,
      storage: files.storage,
    })
    .from(files)
    .where(and(eq(files.id, id), eq(files.projectId, projectId)))

  return file
}

// What still stops D2.11 being sent, in the words the Send button shows.
export function missingToSend(
  payload: JsonObject,
  file: { contentType: string } | undefined
): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!values.routingMethod) {
    missing.push("choose the routing method")
  }

  if (!addressIn(values.sentTo)) {
    missing.push("add the client signatory's email to Sent To")
  }

  if (!values.autoReminder) {
    missing.push("choose whether to remind the client")
  }

  if (file?.contentType !== "application/pdf") {
    missing.push("upload the final contract as a PDF")
  }

  if (!values.script?.trim()) {
    missing.push("add the email script")
  }

  return missing
}

// What the Send button says before the record exists, and after.
export async function signatureMissing(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<string[]> {
  return missingToSend(
    payload,
    await finalFileOf(database, projectId, savedOf(payload).finalContract)
  )
}

async function loadContract(database: Reader, recordId: string) {
  const [record] = await database
    .select({ projectId: toolRecords.projectId, toolId: toolRecords.toolId })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== SIGNATURE_CONTRACT) {
    throw new RecordNotFoundError(`No ${SIGNATURE_CONTRACT} record ${recordId}`)
  }

  return record
}

function linkOf(path: string) {
  return `${requireEnv("BETTER_AUTH_URL").replace(/\/+$/, "")}${path}`
}

// The CA's Send on D2.11: emails the client signatory the script with the
// final contract attached and, for Digital Signature, the link to sign it
// here, and keeps a copy. The time it went is filled in before the email
// goes, which fixes what is being sent, so an edit saved meanwhile cannot
// make the record differ from the email. Only once the email service has
// taken it is the send confirmed, which opens signing and asks the client in
// the app. The record's ID is the email's key, so pressing again sends at
// most once: a Send cut short before it was confirmed can be pressed again,
// and finishes without a second email if the first one went. When the email
// service refuses it, the time is cleared again so the CA can send again.
export async function sendSignatureRequest(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date; storage?: Storages } = {}
): Promise<ToolRecord> {
  const { projectId } = await loadContract(database, recordId)

  await assertCan(database, actor, projectId, SIGNATURE_CONTRACT, "write")

  const { projectName } = await namesOf(database, projectId)
  const started = options.now ?? new Date()
  const subject = signatureSubjectFor(projectName)

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const current = await lockRecord(transaction, recordId)

    if (current.state !== "draft") {
      throw new InvalidTransitionError(
        `A ${current.state} record cannot be sent`
      )
    }

    const values = savedOf(current.payload)

    if (values.dispatchConfirmed) {
      throw new InvalidTransitionError("This contract has already been sent")
    }

    const file = await finalFileOf(transaction, projectId, values.finalContract)
    const missing = missingToSend(current.payload, file)

    if (missing.length > 0 || !file) {
      throw new SendNotReadyError(missing)
    }

    // A Send cut short keeps the time it started.
    if (!values.dateDispatched) {
      await setSystemValues(
        transaction,
        actor,
        recordId,
        {
          dateDispatched: started.toISOString().slice(0, 10),
          dispatchedAt: started.toISOString(),
        },
        "Sending the final contract for signature",
        "draft"
      )
    }

    return {
      to: addressIn(values.sentTo)!,
      digital: values.routingMethod === DIGITAL,
      script: values.script!,
      file,
    }
  })

  const path = signingPath(projectId)

  const sent = await (async () => {
    try {
      const content = await (options.storage ?? storages)[
        prepared.file.storage
      ].read(prepared.file.key)

      const body = prepared.digital
        ? `${prepared.script}\n\nReview and sign it here: ${linkOf(path)}`
        : prepared.script

      return await sendEmail(
        database,
        {
          to: prepared.to,
          kind: "contract_transmittal",
          data: {
            subject,
            body,
            attachment: {
              filename: prepared.file.name,
              content: content.toString("base64"),
            },
          },
          projectId,
          recordId,
          key: `signature_request:${recordId}`,
          keepCopy: true,
        },
        options.transport ?? getTransport()
      )
    } catch (error) {
      return {
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  if (sent.status !== "sent" && sent.status !== "delivered") {
    // Only a refused email is undone: one still queued is another press's,
    // which records itself.
    if (sent.status === "failed") {
      await database.transaction((transaction) =>
        setSystemValues(
          transaction,
          actor,
          recordId,
          { dateDispatched: null, dispatchedAt: null, dispatchConfirmed: null },
          "The email service refused the final contract",
          "draft"
        )
      )
    }

    throw new EmailRefusedError(
      sent.status === "failed"
        ? `The email service did not send it: ${sent.error ?? "no reason given"}. Press Send to try again.`
        : "This email is already being sent. Reload the page in a moment."
    )
  }

  const confirmedAt = (options.now ?? new Date()).toISOString()

  return database.transaction(async (transaction) => {
    const current = await lockRecord(transaction, recordId)

    // Another press confirmed it already.
    if (savedOf(current.payload).dispatchConfirmed) {
      return current
    }

    const confirmed = await setSystemValues(
      transaction,
      actor,
      recordId,
      {
        dateDispatched: confirmedAt.slice(0, 10),
        dispatchConfirmed: confirmedAt,
        ...(prepared.digital && { signatureLink: path }),
      },
      "Final contract sent for signature",
      "draft"
    )

    // The client is asked in the app too; their email is the one just sent.
    if (prepared.digital) {
      await askNextSignature(transaction, actor, confirmed)
    }

    return confirmed
  })
}

// The record as it is now, if it was sent for signature in the app and is
// still waiting for a signature on an active project.
async function waitingRecord(database: Reader, recordId: string) {
  const [record] = await database
    .select({
      id: toolRecords.id,
      projectId: toolRecords.projectId,
      state: toolRecords.state,
      payload: toolRecords.payload,
      projectStatus: projects.status,
    })
    .from(toolRecords)
    .innerJoin(projects, eq(projects.id, toolRecords.projectId))
    .where(eq(toolRecords.id, recordId))

  if (
    !record ||
    record.state !== "draft" ||
    record.projectStatus !== "active"
  ) {
    return undefined
  }

  const values = savedOf(record.payload)
  const at = sentAt(values)

  if (at === undefined || fullySigned(values)) {
    return undefined
  }

  return { id: record.id, projectId: record.projectId, values, at }
}

// Whether an email with this key has gone, or is going.
async function alreadySent(database: Reader, key: string) {
  const [row] = await database
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.key, key), ne(emailLog.status, "failed")))

  return row !== undefined
}

// Run every hour with the contract follow-up. Each D2.11 sent for Digital
// Signature with reminders on, whose client has not signed, sends the client
// one reminder for every three days since it went. Each D2.11 sent and not
// fully signed after seven days is flagged to the project's CA and PM, in
// the app and by email, once each. Each record is read again before
// anything is sent, and each email's key is its record and period, so a run
// that overlaps another sends nothing twice. Returns how many clients this
// run reminded.
export async function sendSignatureReminders(
  database: Database,
  options: { transport?: Transport; now?: Date } = {}
): Promise<number> {
  const now = options.now ?? new Date()
  const transport = options.transport ?? getTransport()

  const candidates = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.toolId, SIGNATURE_CONTRACT),
        eq(toolRecords.state, "draft")
      )
    )

  let reminded = 0

  for (const candidate of candidates) {
    const record = await waitingRecord(database, candidate.id)

    if (!record) {
      continue
    }

    const { clientName, projectName } = await namesOf(
      database,
      record.projectId
    )

    const periods = Math.floor(
      (now.getTime() - record.at) / (REMINDER_DAYS * DAY)
    )

    const to = addressIn(record.values.sentTo)

    if (
      periods >= 1 &&
      to &&
      record.values.routingMethod === DIGITAL &&
      record.values.autoReminder === "Yes" &&
      !record.values.clientSignature
    ) {
      const key = `signature_reminder:${record.id}:${periods}`

      if (!(await alreadySent(database, key))) {
        const sent = await sendEmail(
          database,
          {
            to,
            kind: "signature_reminder",
            data: {
              subject: signatureSubjectFor(projectName),
              clientName,
              link: linkOf(signingPath(record.projectId)),
            },
            projectId: record.projectId,
            recordId: record.id,
            key,
          },
          transport
        )

        if (sent.status === "sent") {
          reminded += 1
        }
      }
    }

    if (now.getTime() - record.at >= OVERDUE_DAYS * DAY) {
      await flagOverdue(database, record.id, projectName, transport)
    }
  }

  return reminded
}

// Whether the record still waits for a signature, read while holding it, so
// a signature given meanwhile is seen.
async function stillWaiting(transaction: Transaction, recordId: string) {
  const current = await lockRecord(transaction, recordId)
  const values = savedOf(current.payload)

  return (
    current.state === "draft" &&
    sentAt(values) !== undefined &&
    !fullySigned(values)
  )
}

// The project's CA and PM, told the contract is 7 days unsigned: in the app
// and by email. Whoever was told already is not told again, and an email that
// failed is sent again on the next run. The record is read again, held, as
// each is told, so a contract signed meanwhile tells nobody.
async function flagOverdue(
  database: Database,
  recordId: string,
  projectName: string,
  transport: Transport
) {
  const record = await waitingRecord(database, recordId)

  if (!record) {
    return
  }

  const team = await database
    .selectDistinct({ id: people.id, email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, record.projectId),
        inArray(personProjectRoles.role, ["CA", "PM"])
      )
    )

  const path = signingPath(record.projectId)

  for (const person of team) {
    const [told] = await database
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.personId, person.id),
          eq(notifications.recordId, record.id),
          eq(notifications.kind, "signature_overdue")
        )
      )

    const waiting = await database.transaction(async (transaction) => {
      if (!(await stillWaiting(transaction, record.id))) {
        return false
      }

      if (!told) {
        await notify(transaction, {
          personIds: [person.id],
          kind: "signature_overdue",
          title: "The final contract is 7 days unsigned",
          text: `${SIGNATURE_CONTRACT} Pending Signature Contract on ${projectName}`,
          projectId: record.projectId,
          recordId: record.id,
          path,
        })
      }

      return true
    })

    if (!waiting) {
      return
    }

    await sendEmail(
      database,
      {
        to: person.email,
        kind: "signature_overdue",
        data: { projectName, link: linkOf(path) },
        projectId: record.projectId,
        recordId: record.id,
        key: `signature_overdue:${record.id}:${person.id}`,
      },
      transport
    )
  }
}
