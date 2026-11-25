import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  emailLog,
  notifications,
  people,
  personProjectRoles,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { INITIAL_DRAFT } from "@/lib/initial-draft"
import {
  FOLLOW_UP_DAYS,
  PENDING,
  QUOTE_DAYS,
  TRANSMITTAL,
  scriptFor,
  sentEmailPath,
  subjectFor,
} from "@/lib/transmittal"
import {
  EmailRefusedError,
  SendNotReadyError,
  acknowledgementDraft,
  copiedAddresses,
} from "@/server/acknowledgement/acknowledgement"
import type { Transaction } from "@/server/audit/audit"
import { requireEnv } from "@/server/database"
import { getTransport, sendEmail, type Transport } from "@/server/email/email"
import { clientAndValue } from "@/server/handoff/handoff"
import { notify } from "@/server/notifications/notifications"
import { shownTool } from "@/server/pdf/preview-source"
import { recordPdf } from "@/server/pdf/record-pdf"
import { assertCan } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"
import {
  InvalidTransitionError,
  RecordNotFoundError,
  lockRecord,
  setSystemValues,
  type ToolRecord,
} from "@/server/records/records"

type Reader = Pick<Transaction, "select">

const DAY = 24 * 60 * 60 * 1000

// The parts of a saved D2.7 that sending and the follow-up read.
const saved = z.object({
  sentTo: z.string().optional().catch(undefined),
  ccBcc: z.string().optional().catch(undefined),
  subject: z.string().optional().catch(undefined),
  script: z.string().optional().catch(undefined),
  followUpScheduled: z.string().optional().catch(undefined),
  initialResponse: z.string().optional().catch(undefined),
  sentBy: z.string().optional().catch(undefined),
  dateSent: z.string().optional().catch(undefined),
  timeSent: z.string().optional().catch(undefined),
})

function savedOf(payload: JsonObject) {
  return saved.parse(payload)
}

// The project's name and the client's, as the scripts name them.
export async function namesOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))

  const known = await clientAndValue(database, projectId)

  return {
    projectName: project?.name ?? "",
    clientName: known?.clientName ?? "[Client Name]",
  }
}

function dayOf(at: Date) {
  return at.toISOString().slice(0, 10)
}

// Where D2.7 starts before the CA saves anything: the quote expiring 30 days
// on, the sheet's script with the client and project named, and no reply
// yet. The CA can change each until the email is sent.
export async function transmittalStart(
  database: Reader,
  projectId: string,
  today = new Date()
): Promise<JsonObject> {
  const { projectName, clientName } = await namesOf(database, projectId)

  return {
    quoteExpiry: dayOf(new Date(today.getTime() + QUOTE_DAYS * DAY)),
    script: scriptFor(clientName, projectName),
    initialResponse: PENDING,
  }
}

// What 1.0 of D2.7 shows, read live until the email is sent: the client's
// email from their web request, as D1.4 sends to, and the fixed subject with
// the project's name. Once sent, what went out is stored and shown instead.
export async function transmittalValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  if (savedOf(payload).sentBy) {
    return {}
  }

  const [{ sentTo }, { projectName }] = await Promise.all([
    acknowledgementDraft(database, projectId),
    namesOf(database, projectId),
  ])

  return { sentTo: sentTo ?? "", subject: subjectFor(projectName) }
}

// What still stops D2.7 being sent, in the words the Send button shows.
export function missingToSend(
  sentTo: string | null,
  payload: JsonObject
): string[] {
  const values = savedOf(payload)
  const missing: string[] = []

  if (!sentTo) {
    missing.push("the client's email is missing from the web request")
  }

  if (!values.script?.trim()) {
    missing.push("add the email script")
  }

  if (!values.followUpScheduled) {
    missing.push("choose whether to follow up after 3 days")
  }

  return missing
}

// The draft contract the email carries: the newest locked D2.2, or T3.D2.2a
// on a Tier 3 project. D2.6's walk-away limits are never sent to the client.
async function draftRecordOf(database: Reader, projectId: string) {
  const [project] = await database
    .select({ track: projects.serviceTrack })
    .from(projects)
    .where(eq(projects.id, projectId))

  const toolId = project ? shownTool(INITIAL_DRAFT, project.track) : undefined

  const [record] = toolId
    ? await database
        .select({ id: toolRecords.id })
        .from(toolRecords)
        .where(
          and(
            eq(toolRecords.projectId, projectId),
            eq(toolRecords.toolId, toolId),
            eq(toolRecords.state, "locked")
          )
        )
        .orderBy(desc(toolRecords.cycle))
        .limit(1)
    : []

  return record?.id
}

async function loadTransmittal(database: Reader, recordId: string) {
  const [record] = await database
    .select({ projectId: toolRecords.projectId, toolId: toolRecords.toolId })
    .from(toolRecords)
    .where(eq(toolRecords.id, recordId))

  if (!record || record.toolId !== TRANSMITTAL) {
    throw new RecordNotFoundError(`No ${TRANSMITTAL} record ${recordId}`)
  }

  return record
}

// A draft D2.7 not yet sent, held for this transaction. Sent By is filled in
// only once the email has gone; Date Sent already while it is going.
async function unsentDraft(
  transaction: Transaction,
  recordId: string
): Promise<ToolRecord> {
  const current = await lockRecord(transaction, recordId)

  if (current.state !== "draft") {
    throw new InvalidTransitionError(`A ${current.state} record cannot be sent`)
  }

  if (savedOf(current.payload).sentBy) {
    throw new InvalidTransitionError("This email has already been sent")
  }

  return current
}

function timeOf(at: Date) {
  const iso = at.toISOString()

  return { dateSent: iso.slice(0, 10), timeSent: iso.slice(11, 16) }
}

// The CA's Send on D2.7: emails the client, copying the CC / BCC addresses,
// with the draft contract's PDF attached, keeps a copy of the email, and
// records who sent it and when. D2.7 stays a draft for the client's reply.
// Date Sent is filled in before the email goes, which freezes what is being
// sent, so an edit saved meanwhile cannot make the record differ from the
// email. The record's ID is the email's key, so pressing twice sends once;
// when the email service refuses it, Date Sent is cleared again and the CA
// can send again.
export async function sendTransmittal(
  database: Database,
  actor: string,
  recordId: string,
  options: { transport?: Transport; now?: Date } = {}
): Promise<ToolRecord> {
  const { projectId } = await loadTransmittal(database, recordId)

  await assertCan(database, actor, projectId, TRANSMITTAL, "write")

  const { sentTo } = await acknowledgementDraft(database, projectId)
  const { projectName } = await namesOf(database, projectId)
  const draftId = await draftRecordOf(database, projectId)
  const started = options.now ?? new Date()

  const prepared = await database.transaction(async (transaction) => {
    await assertProjectActive(transaction, projectId)

    const current = await unsentDraft(transaction, recordId)
    const missing = missingToSend(sentTo, current.payload)

    if (!draftId) {
      missing.push("the draft contract is not locked yet")
    }

    if (missing.length > 0 || !sentTo) {
      throw new SendNotReadyError(missing)
    }

    const values = savedOf(current.payload)

    const sending = {
      to: sentTo,
      cc: copiedAddresses(values.ccBcc),
      script: values.script!,
      followUp: values.followUpScheduled === "Yes",
    }

    await setSystemValues(
      transaction,
      actor,
      recordId,
      timeOf(started),
      "Sending the draft contract to the client",
      "draft"
    )

    return sending
  })

  const sent = await deliver(database, actor, {
    projectId,
    recordId,
    draftId: draftId!,
    subject: subjectFor(projectName),
    prepared,
    transport: options.transport ?? getTransport(),
  })

  if (sent.status !== "sent" && sent.status !== "delivered") {
    // Only a refused email is undone: one still queued is another press's,
    // which records itself.
    if (sent.status === "failed") {
      await database.transaction((transaction) =>
        setSystemValues(
          transaction,
          actor,
          recordId,
          { dateSent: null, timeSent: null },
          "The email service refused the draft contract",
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

  const at = options.now ?? sent.updatedAt

  const [person] = await database
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, actor))

  return database.transaction(async (transaction) => {
    const current = await lockRecord(transaction, recordId)

    // A second press already recorded it.
    if (savedOf(current.payload).sentBy) {
      return current
    }

    return setSystemValues(
      transaction,
      actor,
      recordId,
      {
        sentTo: prepared.to,
        sentBy: person?.name ?? "",
        subject: subjectFor(projectName),
        ...timeOf(at),
        sentEmailLink: sentEmailPath(projectId, TRANSMITTAL),
        followUpDate: prepared.followUp
          ? dayOf(new Date(at.getTime() + FOLLOW_UP_DAYS * DAY))
          : null,
      },
      "Draft contract sent to the client",
      "draft"
    )
  })
}

// The email itself, with the draft contract's PDF, as the CA may read it.
// Anything that stops it before the email service answers counts as refused.
async function deliver(
  database: Database,
  actor: string,
  input: {
    projectId: string
    recordId: string
    draftId: string
    subject: string
    prepared: { to: string; cc: string[]; script: string }
    transport: Transport
  }
) {
  try {
    const pdf = await recordPdf(database, actor, input.draftId)

    return await sendEmail(
      database,
      {
        to: input.prepared.to,
        cc: input.prepared.cc,
        kind: "contract_transmittal",
        data: {
          subject: input.subject,
          body: input.prepared.script,
          attachment: {
            filename: pdf.fileName,
            content: pdf.content.toString("base64"),
          },
        },
        projectId: input.projectId,
        recordId: input.recordId,
        key: `transmittal:${input.recordId}`,
        keepCopy: true,
      },
      input.transport
    )
  } catch (error) {
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    }
  }
}

// The copy of the email a tool record sent, as it went out, if it kept one.
export async function sentEmailOf(database: Reader, recordId: string) {
  const [row] = await database
    .select({ copy: emailLog.copy, sentAt: emailLog.updatedAt })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.recordId, recordId),
        inArray(emailLog.status, ["sent", "delivered"]),
        isNotNull(emailLog.copy)
      )
    )
    .orderBy(desc(emailLog.updatedAt))

  return row?.copy ? { ...row.copy, sentAt: row.sentAt } : undefined
}

function sentAtOf(values: z.infer<typeof saved>) {
  const at = Date.parse(`${values.dateSent}T${values.timeSent ?? "00:00"}:00Z`)

  return Number.isNaN(at) ? undefined : at
}

// The follow-up, run every hour: each D2.7 sent with a follow-up, three days
// or more ago, whose client has still not answered, gets one reminder, and
// the project's Contract Admins are told in the app and by email. A reply
// recorded, a follow-up of No, a locked record or a project not active sends
// nothing; each record is read again just before its reminder. Each reminder's
// key is its record, so it goes once, and a Contract Admin not yet told is
// told on a later run. Returns how many clients this run reminded.
export async function sendTransmittalFollowUps(
  database: Database,
  options: { transport?: Transport; now?: Date } = {}
): Promise<number> {
  const now = options.now ?? new Date()
  const transport = options.transport ?? getTransport()

  const candidates = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(eq(toolRecords.toolId, TRANSMITTAL), eq(toolRecords.state, "draft"))
    )

  let reminded = 0

  for (const candidate of candidates) {
    const record = await dueRecord(database, candidate.id, now)

    if (!record) {
      continue
    }

    const key = `transmittal_follow_up:${record.id}`

    const [already] = await database
      .select({ id: emailLog.id })
      .from(emailLog)
      .where(and(eq(emailLog.key, key), ne(emailLog.status, "failed")))

    const { clientName, projectName } = await namesOf(
      database,
      record.projectId
    )

    if (!already) {
      const sent = await sendEmail(
        database,
        {
          to: record.values.sentTo!,
          kind: "transmittal_follow_up",
          data: {
            subject: record.values.subject ?? subjectFor(projectName),
            clientName,
          },
          projectId: record.projectId,
          recordId: record.id,
          key,
        },
        transport
      )

      if (sent.status !== "sent") {
        continue
      }

      reminded += 1
    }

    await tellContractAdmins(database, record, projectName, transport)
  }

  return reminded
}

// The record as it is now, if its client is due a reminder.
async function dueRecord(database: Reader, recordId: string, now: Date) {
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
  const sentAt = sentAtOf(values)

  if (
    !values.sentBy ||
    !values.sentTo ||
    values.followUpScheduled !== "Yes" ||
    values.initialResponse !== PENDING ||
    sentAt === undefined ||
    now.getTime() - sentAt < FOLLOW_UP_DAYS * DAY
  ) {
    return undefined
  }

  return { id: record.id, projectId: record.projectId, values }
}

// The project's Contract Admins, told the client was reminded: in the app,
// and by email. Whoever was told already is not told again, and an email that
// failed is sent again on the next run.
async function tellContractAdmins(
  database: Database,
  record: { id: string; projectId: string },
  projectName: string,
  transport: Transport
) {
  const admins = await database
    .select({ id: people.id, email: people.email })
    .from(personProjectRoles)
    .innerJoin(people, eq(people.id, personProjectRoles.personId))
    .where(
      and(
        eq(personProjectRoles.projectId, record.projectId),
        eq(personProjectRoles.role, "CA")
      )
    )

  const path = `/projects/${record.projectId}/tools/${TRANSMITTAL}`
  const link = `${requireEnv("BETTER_AUTH_URL").replace(/\/+$/, "")}${path}`

  for (const admin of admins) {
    const [told] = await database
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.personId, admin.id),
          eq(notifications.recordId, record.id),
          eq(notifications.kind, "follow_up_sent")
        )
      )

    if (!told) {
      await database.transaction((transaction) =>
        notify(transaction, {
          personIds: [admin.id],
          kind: "follow_up_sent",
          title: "The client was reminded about the draft contract",
          text: `D2.7 Client Transmitted Record on ${projectName}`,
          projectId: record.projectId,
          recordId: record.id,
          path,
        })
      )
    }

    await sendEmail(
      database,
      {
        to: admin.email,
        kind: "follow_up_sent",
        data: { projectName, link },
        projectId: record.projectId,
        recordId: record.id,
        key: `follow_up_sent:${record.id}:${admin.id}`,
      },
      transport
    )
  }
}
