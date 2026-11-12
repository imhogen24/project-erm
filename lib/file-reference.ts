import { z } from "zod"

// How a record points at a file uploaded in the ERM: `file:<id>`. Only the ERM
// reads it, so moving storage never touches a record. Files the website
// uploaded are held as their https links instead.
const prefix = "file:"

export function fileReference(id: string): string {
  return `${prefix}${id}`
}

// The file's ID, or undefined for anything else, such as a website link.
export function fileIdOf(reference: string): string | undefined {
  if (!reference.startsWith(prefix)) {
    return undefined
  }

  const id = z.uuid().safeParse(reference.slice(prefix.length))

  return id.success ? id.data : undefined
}

// The website accepts at most ten files on a request; so does the ERM.
export const MAX_FILES = 10
