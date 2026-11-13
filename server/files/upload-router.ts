import { createUploadthing, type FileRouter } from "uploadthing/next"
import { UploadThingError } from "uploadthing/server"
import { z } from "zod"

import { MAX_FILES } from "@/lib/file-reference"
import { getAuth } from "@/server/auth"
import { getDatabase } from "@/server/database"
import { isClientAccount } from "@/server/intake/client-requests"
import { can } from "@/server/permissions/permissions"
import { assertProjectActive } from "@/server/projects/projects"

import { recordUpload } from "./uploads"

const upload = createUploadthing()

// The website's limits: images and PDFs, 16MB each. Files are public, as the
// website's are, since UploadThing's free plan refuses private ones: the ERM
// never shows the storage link, but whoever has it can open the file. Moving
// to Cloudflare R2 makes them private (docs/CLIENT_FILES/_.md).
const kind = {
  maxFileSize: "16MB",
  maxFileCount: MAX_FILES,
  acl: "public-read",
} as const

// Photos and videos of a measured part, and PDFs, attached to a record's
// file cells by the people who write that tool.
const evidence = { ...kind, maxFileCount: MAX_FILES } as const

const video = { ...evidence, maxFileSize: "64MB" } as const

const onRecord = z.object({ projectId: z.uuid(), toolId: z.string().min(1) })

export const uploadRouter = {
  // The files a client sends with their web form.
  clientFiles: upload({ image: kind, pdf: kind })
    .middleware(async ({ req, files }) => {
      // Each kind has its own count; the request's limit is for both.
      if (files.length > MAX_FILES) {
        throw new UploadThingError(`Attach at most ${MAX_FILES} files`)
      }

      const session = await getAuth().api.getSession({ headers: req.headers })

      if (
        !session ||
        !(await isClientAccount(getDatabase(), session.user.id))
      ) {
        throw new UploadThingError("Only a client sends files here")
      }

      return { personId: session.user.id }
    })
    .onUploadComplete(async ({ metadata, file }) =>
      recordUpload(getDatabase(), metadata.personId, {
        key: file.key,
        name: file.name,
        size: file.size,
        contentType: file.type,
      })
    ),
  // Files staff attach to a record, on a project and tool they may write.
  recordFiles: upload({ image: evidence, video, pdf: evidence })
    .input(onRecord)
    .middleware(async ({ req, input }) => {
      const session = await getAuth().api.getSession({ headers: req.headers })

      if (
        !session ||
        !(await can(
          getDatabase(),
          session.user.id,
          input.projectId,
          input.toolId,
          "write"
        ))
      ) {
        throw new UploadThingError("You cannot attach files to this tool")
      }

      try {
        await getDatabase().transaction((transaction) =>
          assertProjectActive(transaction, input.projectId)
        )
      } catch {
        throw new UploadThingError("This project is not active")
      }

      return { personId: session.user.id, projectId: input.projectId }
    })
    .onUploadComplete(async ({ metadata, file }) =>
      recordUpload(
        getDatabase(),
        metadata.personId,
        {
          key: file.key,
          name: file.name,
          size: file.size,
          contentType: file.type,
        },
        metadata.projectId
      )
    ),
} satisfies FileRouter

export type UploadRouter = typeof uploadRouter
