import { DrizzleQueryError, and, desc, eq, inArray } from "drizzle-orm"
import { DatabaseError } from "pg"
import { z } from "zod"

import type { Database } from "@/db"
import {
  files,
  people,
  projects,
  toolRecords,
  type JsonObject,
} from "@/db/schema"
import { ghs } from "@/lib/cost-estimation"
import { APP_PLATFORM, EXECUTED_CONTRACT, SCAN } from "@/lib/executed-contract"
import { fileIdOf, fileReference } from "@/lib/file-reference"
import {
  CLIENT_ROLE,
  DIGITAL,
  IMHOGEN_ROLE,
  SIGNATURE_CONTRACT,
} from "@/lib/signature-contract"
import type { Transaction } from "@/server/audit/audit"
import { advanceDueOf, contractValueOf } from "@/server/contract/advance"
import { baselineValues } from "@/server/contract/baseline"
import { addressIn } from "@/server/contract/signature-contract"
import { storages, type Storages } from "@/server/files/storage"
import { ToolNotAvailableError, createRecordIn } from "@/server/records/records"
import {
  signaturePage,
  signingLog,
  withPageAdded,
  type SigningRecord,
} from "@/server/pdf/signing-pdfs"

type Reader = Pick<Transaction, "select">

const text = z.string().optional().catch(undefined)

const signature = z
  .object({ signedBy: z.string(), signedAt: z.string() })
  .optional()
  .catch(undefined)

// The parts of the locked D2.11 that D2.12 reads.
const signed = z.object({
  routingMethod: text,
  sentTo: text,
  imhogenSignatory: text,
  finalContract: text,
  dateDispatched: text,
  clientViewedAt: text,
  heViewedAt: text,
  clientSignature: signature,
  heSignature: signature,
  signatories: z
    .array(z.object({ dateSigned: text }).catch({ dateSigned: undefined }))
    .catch([]),
})

type Signed = z.infer<typeof signed>

const caSigned = z
  .object({ caSignature: signature })
  .catch({ caSignature: undefined })

function dayOf(at: string | undefined) {
  return at ? at.slice(0, 10) : undefined
}

// The project's locked D2.11, the contract both sides signed.
async function signedContract(database: Reader, projectId: string) {
  const [record] = await database
    .select({ id: toolRecords.id, payload: toolRecords.payload })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, SIGNATURE_CONTRACT),
        eq(toolRecords.state, "locked")
      )
    )
    .orderBy(desc(toolRecords.cycle))
    .limit(1)

  return record
    ? { id: record.id, values: signed.parse(record.payload) }
    : undefined
}

// The day both sides had signed: the HE's signature in the app, or the later
// Date Signed recorded on paper.
function executedOn(values: Signed): string | undefined {
  if (values.routingMethod === DIGITAL) {
    return dayOf(values.heSignature?.signedAt)
  }

  const days = values.signatories.flatMap((row) =>
    row.dateSigned ? [row.dateSigned] : []
  )

  return days.length === 0 ? undefined : days.sort().at(-1)
}

// Sent To without its email address: the client signatory's name.
function nameIn(sentTo: string | undefined) {
  const address = addressIn(sentTo)

  return (address ? (sentTo ?? "").replace(address, "") : (sentTo ?? ""))
    .replace(/[<>(),;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// What 1.0 of D2.12 shows, read live: when the contract was fully executed,
// who signed it, and its value and advance. The day the CA signs fills
// Date.
export async function executedValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const [[project], contract, value, advance, names] = await Promise.all([
    database
      .select({ requestId: projects.requestId })
      .from(projects)
      .where(eq(projects.id, projectId)),
    signedContract(database, projectId),
    contractValueOf(database, projectId),
    advanceDueOf(database, projectId),
    baselineValues(database, projectId),
  ])

  const values = contract?.values
  const executed = values ? executedOn(values) : undefined
  const signedAt = caSigned.parse(payload).caSignature?.signedAt

  return {
    ...names,
    requestId: project?.requestId ?? "",
    ...(executed && { dateExecuted: executed }),
    clientSignatory: nameIn(values?.sentTo),
    imhogenSignatory: values?.imhogenSignatory ?? "",
    totalContractValue: value === undefined ? "" : ghs(value),
    advanceDue: advance === undefined ? "" : ghs(advance),
    ...(signedAt && { signedDate: signedAt.slice(0, 10) }),
  }
}

async function namesOfPeople(database: Reader, ids: string[]) {
  const rows =
    ids.length === 0
      ? []
      : await database
          .select({ id: people.id, name: people.name })
          .from(people)
          .where(inArray(people.id, ids))

  return new Map(rows.map((row) => [row.id, row.name]))
}

// Who signed D2.11 in the app, and when each viewed and signed it.
async function signingRecordOf(
  database: Reader,
  projectId: string,
  values: Signed
): Promise<SigningRecord> {
  const [project] = await database
    .select({ name: projects.name, requestId: projects.requestId })
    .from(projects)
    .where(eq(projects.id, projectId))

  const names = await namesOfPeople(
    database,
    [values.clientSignature?.signedBy, values.heSignature?.signedBy].flatMap(
      (id) => (id && z.uuid().safeParse(id).success ? [id] : [])
    )
  )

  const nameOf = (id: string | undefined, fallback: string) =>
    (id && names.get(id)) || fallback

  return {
    projectName: project?.name ?? "",
    requestId: project?.requestId ?? "",
    sentOn: values.dateDispatched,
    signers: [
      {
        name: nameOf(values.clientSignature?.signedBy, nameIn(values.sentTo)),
        role: CLIENT_ROLE,
        viewedOn: dayOf(values.clientViewedAt),
        signedOn: dayOf(values.clientSignature?.signedAt),
      },
      {
        name: nameOf(
          values.heSignature?.signedBy,
          values.imhogenSignatory ?? ""
        ),
        role: IMHOGEN_ROLE,
        viewedOn: dayOf(values.heViewedAt),
        signedOn: dayOf(values.heSignature?.signedAt),
      },
    ],
  }
}

// The D2.12 draft the CA starts on after a contract signed in the app,
// made the first time they open it: the signed contract and its signing log,
// made by the app, are already in 2.0. The signed contract is the final
// contract with a page added listing each signer, their role and the day they
// signed; the log says when it was sent and when each signer viewed and
// signed it. D2.11 itself, locked, is never changed. Both files are stored
// first; then, in one transaction, they become uploads on the project and
// the draft is created with them, which is audited. Whoever opens D2.12 at
// the same moment and loses finds the draft already there, and the files of
// any attempt not kept are removed again. Nothing for a contract signed on
// paper, or once D2.12 has a record; and a contract the app cannot read, or
// a store that refuses the files, starts nothing: the CA uploads them
// instead. Returns whether it started the draft.
export async function startExecutedRecord(
  database: Database,
  actor: string,
  projectId: string,
  storage: Storages = storages
): Promise<boolean> {
  const contract = await signedContract(database, projectId)
  const values = contract?.values

  if (!contract || values?.routingMethod !== DIGITAL) {
    return false
  }

  const [existing] = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(
        eq(toolRecords.projectId, projectId),
        eq(toolRecords.toolId, EXECUTED_CONTRACT)
      )
    )
    .limit(1)

  if (existing) {
    return false
  }

  const stored: string[] = []
  let kept = false

  try {
    const id = fileIdOf(values.finalContract ?? "")

    const [final] = id
      ? await database
          .select({ key: files.key, name: files.name })
          .from(files)
          .where(and(eq(files.id, id), eq(files.projectId, projectId)))
      : []

    if (!final) {
      return false
    }

    const record = await signingRecordOf(database, projectId, values)
    const base = final.name.replace(/\.pdf$/i, "")

    const made = [
      {
        name: `${base} (Executed).pdf`,
        bytes: await withPageAdded(
          await storage.uploadthing.read(final.key),
          await signaturePage(record)
        ),
      },
      { name: `${base} (Signing log).pdf`, bytes: await signingLog(record) },
    ]

    for (const file of made) {
      stored.push(
        await storage.uploadthing.write(
          file.name,
          "application/pdf",
          file.bytes
        )
      )
    }

    await database.transaction(async (transaction) => {
      const rows = await transaction
        .insert(files)
        .values(
          made.map((file, index) => ({
            storage: "uploadthing" as const,
            key: stored[index]!,
            name: file.name,
            size: file.bytes.length,
            contentType: "application/pdf",
            uploadedBy: actor,
            projectId,
          }))
        )
        .returning({ id: files.id })

      await createRecordIn(transaction, actor, {
        projectId,
        toolId: EXECUTED_CONTRACT,
        payload: {
          platform: APP_PLATFORM,
          executedPdf: fileReference(rows[0]!.id),
          auditCertificate: fileReference(rows[1]!.id),
        },
      })
    })

    kept = true

    return true
  } catch (error) {
    // Someone else started it meanwhile, or the database refused a second
    // live record: theirs is kept.
    const taken =
      error instanceof ToolNotAvailableError ||
      (error instanceof DrizzleQueryError &&
        error.cause instanceof DatabaseError &&
        error.cause.constraint === "tool_records_one_live_per_cycle")

    if (!taken) {
      console.error("The signed contract could not be made", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return false
  } finally {
    if (!kept) {
      for (const key of stored) {
        await storage.uploadthing.remove(key).catch(() => undefined)
      }
    }
  }
}

// Where D2.12 starts before the CA saves anything: the platform D2.11 was
// signed on. A contract signed in the app starts its draft with the files
// the app made (startExecutedRecord). The CA can change each.
export async function executedStart(
  database: Reader,
  projectId: string
): Promise<JsonObject> {
  const contract = await signedContract(database, projectId)

  if (!contract) {
    return {}
  }

  return {
    platform: contract.values.routingMethod === DIGITAL ? APP_PLATFORM : SCAN,
  }
}
