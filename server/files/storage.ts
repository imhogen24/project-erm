import { UTApi } from "uploadthing/server"

import type { fileStorages } from "@/db/schema"

// The one place that knows where files are kept. Moving storage, such as to
// Cloudflare R2, means a new entry here and copying the bytes; records and
// screens only ever hold `file:<id>`.
export type FileStorage = {
  // A short-lived link that opens the private file.
  signedLink(key: string): Promise<string>
}

export type Storages = Record<(typeof fileStorages)[number], FileStorage>

let utapi: UTApi | undefined

const uploadThing: FileStorage = {
  async signedLink(key) {
    // Reads UPLOADTHING_TOKEN on first use.
    utapi ??= new UTApi()

    const { ufsUrl } = await utapi.generateSignedURL(key, { expiresIn: "5m" })

    return ufsUrl
  },
}

export const storages: Storages = { uploadthing: uploadThing }
