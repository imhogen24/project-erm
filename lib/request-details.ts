import type { ClientFile } from "@/lib/client-files"

// A web form has no recipient address and no subject line.
export const NOT_APPLICABLE = "Not applicable (web form)"

// Where a request came from, as the saved copy of it says. Nobody types this.
export type RequestMetadata = {
  source: string
  receivedAt: Date | null
  sender: string | null
  recipient: string
  subject: string
}

// What D1.2 shows from elsewhere. The metadata is null when the project has no
// saved request. The files are D1.1's, in its order, and each is opened
// through D1.1's record, which holds its link.
export type RequestDetails = {
  metadata: RequestMetadata | null
  files: ClientFile[]
  filesRecordId: string | null
}
