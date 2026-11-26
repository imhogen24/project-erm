import type { Database } from "@/db"
import { storages, type Storages } from "@/server/files/storage"
import { ARCHIVE, vaultDocuments } from "@/lib/archive"
import { previewCellKey, type PreviewState } from "@/lib/pdf-preview"
import { fillText } from "@/lib/placeholders"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { systemFillsOf } from "@/server/records/fills"
import { RecordNotFoundError } from "@/server/records/records"
import { cellPreviewSource } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { previewStates, toolPdf, uploadPdf } from "./previews"
import type { RecordPdf } from "./record-pdf"

// One document of the project's archive: what it is, the standard name it is
// downloaded under, and what its preview shows this person.
export type ArchivedDocument = {
  key: string
  fileName: string
  state: PreviewState
  download: string
}

export function archiveDownloadHref(projectId: string, row: number) {
  return `/api/projects/${projectId}/archive/${row}`
}

async function assertMayReadArchive(
  database: Database,
  actor: string,
  projectId: string
) {
  if (!(await can(database, actor, projectId, ARCHIVE, "read"))) {
    throw new PermissionDeniedError(`This person may not read ${ARCHIVE}`)
  }
}

// The project's archive as this person sees it: D2.13's 2.0 documents, each
// with its standard file name. It is for whoever may read D2.13, and each
// document still follows its own tool's read access ("No access").
export async function archiveOf(
  database: Database,
  actor: string,
  projectId: string
): Promise<ArchivedDocument[]> {
  await assertMayReadArchive(database, actor, projectId)

  const tool = tools.getTool(ARCHIVE)!

  const [states, fills] = await Promise.all([
    previewStates(database, actor, projectId, tool),
    systemFillsOf(database, projectId, ARCHIVE),
  ])

  return vaultDocuments.map((document, row) => {
    const key = previewCellKey("vault", row, "document")

    return {
      key,
      fileName: fillText(document.naming, fills),
      state: states[key]!,
      download: archiveDownloadHref(projectId, row),
    }
  })
}

// One archived document as a PDF to download, under its standard name, such
// as IMHO_Brief_ClientTestLtd.pdf. Refused like the tool's own PDF.
export async function archivedPdf(
  database: Database,
  actor: string,
  projectId: string,
  row: number,
  storage: Storages = storages
): Promise<RecordPdf> {
  const document = vaultDocuments[row]

  if (!document) {
    throw new RecordNotFoundError(`The archive has no document ${row}`)
  }

  await assertMayReadArchive(database, actor, projectId)

  const source = cellPreviewSource(document.document)

  const pdf =
    "upload" in source
      ? await uploadPdf(
          database,
          actor,
          projectId,
          source.upload.tool,
          source.upload.field,
          storage
        )
      : await toolPdf(database, actor, projectId, document.document)

  const fills = await systemFillsOf(database, projectId, ARCHIVE)

  return { ...pdf, fileName: fillText(document.naming, fills) }
}
