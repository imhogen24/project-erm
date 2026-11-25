import { UTApi } from "uploadthing/server"

import type { fileStorages } from "@/db/schema"

// The one place that knows where files are kept. Moving storage, such as to
// Cloudflare R2, means a new entry here and copying the bytes; records and
// screens only ever hold `file:<id>`.
export type FileStorage = {
  // A short-lived link that opens the private file.
  signedLink(key: string): Promise<string>
  // The file's bytes, such as a contract to attach to an email.
  read(key: string): Promise<Buffer>
  // Keeps a file the app made, such as a signed contract, and gives its key.
  write(name: string, type: string, bytes: Buffer): Promise<string>
  // Removes a file the app made that nothing points at.
  remove(key: string): Promise<void>
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
  async read(key) {
    const response = await fetch(await uploadThing.signedLink(key))

    if (!response.ok) {
      throw new Error(`The file could not be read: ${response.status}`)
    }

    return Buffer.from(await response.arrayBuffer())
  },
  async write(name, type, bytes) {
    utapi ??= new UTApi()

    const { data, error } = await utapi.uploadFiles(
      new File([new Uint8Array(bytes)], name, { type })
    )

    if (error) {
      throw new Error(`The file could not be stored: ${error.message}`)
    }

    return data.key
  },
  async remove(key) {
    utapi ??= new UTApi()

    await utapi.deleteFiles(key)
  },
}

export const storages: Storages = { uploadthing: uploadThing }
