import { createUploadthing, type FileRouter } from "uploadthing/next"
import { UploadThingError } from "uploadthing/server"

import { MAX_FILES } from "@/lib/file-reference"
import { getAuth } from "@/server/auth"
import { getDatabase } from "@/server/database"
import { isClientAccount } from "@/server/intake/client-requests"

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
} satisfies FileRouter

export type UploadRouter = typeof uploadRouter
