// D2.13, the archived contract record: once the contract is executed, the
// Contract Admin checks each key contract document is in the project's
// archive under its standard name, and signs it off.

export const ARCHIVE = "D2.13"

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

export const yesNo = ["Yes", "No"]

// 2.0's documents: what each row shows, as a tool's ID or "<tool>:<field>"
// for a file uploaded to it, and the standard name it is archived under.
export const vaultDocuments = [
  { document: "D1.15", naming: "IMHO_Brief_[Client Name].pdf" },
  { document: "D2.6", naming: "IMHO_Contract_V1_[Client Name].pdf" },
  { document: "D2.9", naming: "IMHO_NegNotes_[Client Name].pdf" },
  {
    document: "D2.12:executedPdf",
    naming: "IMHO_ExecutedContract_[Client Name].pdf",
  },
  {
    document: "D2.12:auditCertificate",
    naming: "IMHO_AuditCert_[Client Name].pdf",
  },
]

// The client's name as a file name holds it: letters and digits only, such
// as "ClientTestLtd".
export function fileNamePart(clientName: string) {
  return clientName.replace(/[^A-Za-z0-9]/g, "")
}

// The project's archive page.
export function archivePath(projectId: string) {
  return `/projects/${projectId}/archive`
}
