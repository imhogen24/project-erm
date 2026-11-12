import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import { files, type JsonObject } from "@/db/schema"
import { fileIdOf } from "@/lib/file-reference"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { RecordNotFoundError, getRecord } from "@/server/records/records"
import { tools } from "@/server/tools/registry"

import { storages, type Storages } from "./storage"

// Every refusal carries the same message, so a record a person may not read
// looks the same as one that does not exist, and a link not on the record looks
// the same as either.
export class FileNotFoundError extends Error {
  constructor() {
    super("No such file")
  }
}

const storedLink = z.string()

const tableRows = z.array(z.record(z.string(), z.unknown()))

function linkIn(value: JsonObject[string] | undefined): string[] {
  const link = storedLink.safeParse(value)

  return link.success ? [link.data] : []
}

// The links held in the record's fileLink fields and fileLink table cells, as
// they were saved.
function storedLinks(toolId: string, payload: JsonObject): string[] {
  const tool = tools.getTool(toolId)

  if (!tool) {
    return []
  }

  return tool.fields.flatMap((field) => {
    if (field.type === "fileLink") {
      return linkIn(payload[field.key])
    }

    const rows = tableRows.safeParse(payload[field.key])

    if (field.type !== "table" || !rows.success) {
      return []
    }

    const linkColumns = field.columns.filter(
      (column) => column.type === "fileLink"
    )

    return rows.data.flatMap((row) =>
      linkColumns.flatMap((column) => {
        const cell = storedLink.safeParse(row[column.key])

        return cell.success ? [cell.data] : []
      })
    )
  })
}

function isHttps(link: string): boolean {
  return URL.canParse(link) && new URL(link).protocol === "https:"
}

// A file uploaded in the ERM opens through a fresh short-lived link, and only
// from a record on the project it was sent with.
async function uploadedLink(
  database: Database,
  projectId: string,
  id: string,
  storage: Storages
): Promise<string> {
  const [file] = await database
    .select({ storage: files.storage, key: files.key })
    .from(files)
    .where(and(eq(files.id, id), eq(files.projectId, projectId)))

  if (!file) {
    throw new FileNotFoundError()
  }

  return storage[file.storage].signedLink(file.key)
}

// The link to send a person to for a file on a record. The reference must be
// stored on that record, compared exactly, so this never sends anyone to an
// address the record does not hold. A file uploaded in the ERM is private and
// gets a link that expires; a website link is public, so for those this only
// decides what the ERM hands out.
export async function fileLinkFor(
  database: Database,
  actor: string,
  recordId: string,
  reference: string,
  storage: Storages = storages
): Promise<string> {
  if (!z.uuid().safeParse(recordId).success) {
    throw new FileNotFoundError()
  }

  let record

  try {
    record = await getRecord(database, actor, recordId)
  } catch (error) {
    if (
      error instanceof RecordNotFoundError ||
      error instanceof PermissionDeniedError
    ) {
      throw new FileNotFoundError()
    }

    throw error
  }

  const stored = storedLinks(record.toolId, record.payload)

  if (!stored.includes(reference)) {
    throw new FileNotFoundError()
  }

  const uploaded = fileIdOf(reference)

  if (uploaded) {
    return uploadedLink(database, record.projectId, uploaded, storage)
  }

  if (!isHttps(reference)) {
    throw new FileNotFoundError()
  }

  return reference
}
