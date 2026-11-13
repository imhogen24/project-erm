import { and, eq, inArray, isNull } from "drizzle-orm"

import type { Database } from "@/db"
import { files, type JsonObject } from "@/db/schema"
import { MAX_FILES, fileIdOf, fileReference } from "@/lib/file-reference"
import type { Transaction } from "@/server/audit/audit"
import { ValidationError } from "@/server/records/validate"

export type Upload = {
  key: string
  name: string
  size: number
  contentType: string
}

// Saves a finished upload. The storage may report the same upload twice, so
// a key already saved returns the same file.
// A file staff attach to a record belongs to its project from the start; a
// client's belongs to none until their request is sent.
export async function recordUpload(
  database: Pick<Database, "insert" | "select">,
  personId: string,
  upload: Upload,
  projectId?: string
): Promise<{ id: string; name: string }> {
  const [added] = await database
    .insert(files)
    .values({
      storage: "uploadthing",
      uploadedBy: personId,
      projectId: projectId ?? null,
      ...upload,
    })
    .onConflictDoNothing({ target: files.key })
    .returning({ id: files.id, name: files.name })

  if (added) {
    return added
  }

  const [saved] = await database
    .select({ id: files.id, name: files.name })
    .from(files)
    .where(and(eq(files.key, upload.key), eq(files.uploadedBy, personId)))

  if (!saved) {
    throw new Error("This upload belongs to someone else")
  }

  return saved
}

const missing = new ValidationError([
  {
    field: "files",
    message: "A file did not finish uploading. Remove it and add it again.",
  },
])

const tooMany = new ValidationError([
  { field: "files", message: `Attach at most ${MAX_FILES} files` },
])

// Puts the person's new uploads on the project. Each must be theirs and not
// yet sent with a request.
async function claim(
  transaction: Transaction,
  personId: string,
  projectId: string,
  ids: string[]
): Promise<Map<string, JsonObject>> {
  if (ids.length === 0) {
    return new Map()
  }

  const claimed = await transaction
    .update(files)
    .set({ projectId })
    .where(
      and(
        inArray(files.id, ids),
        eq(files.uploadedBy, personId),
        isNull(files.projectId)
      )
    )
    .returning({ id: files.id, name: files.name, at: files.uploadedAt })

  if (claimed.length !== ids.length) {
    throw missing
  }

  return new Map(
    claimed.map((file) => [
      fileReference(file.id),
      {
        label: file.name,
        dateUploaded: file.at.toISOString().slice(0, 10),
        fileLink: fileReference(file.id),
      },
    ])
  )
}

// D1.1's file rows once the client sends their form, in the order they gave:
// rows already on D1.1 that they kept, and their new uploads, which are put
// on the project.
export async function attachedFilesIn(
  transaction: Transaction,
  personId: string,
  projectId: string,
  references: string[],
  current: JsonObject[] = []
): Promise<JsonObject[]> {
  const chosen = [...new Set(references)]

  if (chosen.length > MAX_FILES) {
    throw tooMany
  }

  const kept = new Map(current.map((row) => [row.fileLink, row]))
  const added = chosen.filter((reference) => !kept.has(reference))
  const ids = added.flatMap((reference) => fileIdOf(reference) ?? [])

  if (ids.length !== added.length) {
    throw missing
  }

  const uploaded = await claim(transaction, personId, projectId, ids)

  return chosen.flatMap((reference) => {
    const row = kept.get(reference) ?? uploaded.get(reference)

    return row ? [row] : []
  })
}
