import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { PdfPreviewField, PdfPreviews } from "@/components/pdf-preview-field"
import {
  DataCell,
  DataRow,
  DataTable,
  TableBox,
} from "@/components/sheet-table"
import { Button } from "@/components/ui/button"
import { ARCHIVE } from "@/lib/archive"
import { widthsOf } from "@/lib/column-widths"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { ensureToolsRegistered, registeredTools } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { archiveOf } from "@/server/pdf/archive"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"

import { projectNav } from "../sidebar"

// A document's name, then its standard file name with View and Download.
const archiveWidths = widthsOf(["text", "long"])

// The project's contract archive: D2.13's documents, each under its standard
// file name, to read beside the list or download. Open to whoever reads
// D2.13; each document follows its own tool's access.
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const session = await requireSession()

  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  ensureToolsRegistered()

  const database = getDatabase()

  let documents
  let overview

  try {
    documents = await archiveOf(database, session.user.id, projectId)
    overview = await getProjectOverview(
      database,
      session.user.id,
      projectId,
      registeredTools
    )
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      notFound()
    }

    throw error
  }

  const canInvite = await isItAdmin(session.user.id)

  const states = Object.fromEntries(
    documents.map((document) => [document.key, document.state])
  )

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} project={projectNav(overview)} />
        <main className="table-wide table-home">
          <BackLink
            href={`/projects/${projectId}/tools/${ARCHIVE}`}
            className="mb-3 border-y bg-background"
          >
            {`${ARCHIVE} ${registeredTools.find((tool) => tool.id === ARCHIVE)?.name ?? ""}`}
          </BackLink>
          <PageSheet title="Contract archive">
            <PdfPreviews states={states}>
              <div className="@container">
                <TableBox title="Archived documents">
                  <DataTable
                    label="Archived documents"
                    columns={["Document", "File"]}
                    widths={archiveWidths}
                  >
                    {documents.map((document) => (
                      <DataRow key={document.key} widths={archiveWidths}>
                        <DataCell label="Document">
                          <span className="text-base [overflow-wrap:anywhere]">
                            {document.state.name}
                          </span>
                        </DataCell>
                        {/* The file's standard name at the left, View and
                            Download at the right, so every row's buttons
                            line up and no column is left without a name. */}
                        <DataCell label="File">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="min-w-0 text-base [overflow-wrap:anywhere] text-muted-foreground">
                              {document.fileName}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <PdfPreviewField
                                id={`archive-${document.key}`}
                                field={{
                                  key: document.key,
                                  label: document.state.name,
                                }}
                              />
                              {/* Download shows, disabled, before the file
                                  is there, so View stays in its column. */}
                              {document.state.status === "ready" ? (
                                <Button
                                  asChild
                                  variant="outline"
                                  className="h-9 gap-2 px-3 text-sm"
                                >
                                  <a
                                    href={document.download}
                                    download={document.fileName}
                                  >
                                    <DownloadSimpleIcon aria-hidden />
                                    Download
                                    <span className="sr-only">
                                      {` ${document.fileName}`}
                                    </span>
                                  </a>
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  className="h-9 gap-2 px-3 text-sm"
                                  disabled
                                >
                                  <DownloadSimpleIcon aria-hidden />
                                  Download
                                  <span className="sr-only">
                                    {` ${document.fileName}`}
                                  </span>
                                </Button>
                              )}
                            </div>
                          </div>
                        </DataCell>
                      </DataRow>
                    ))}
                  </DataTable>
                </TableBox>
              </div>
            </PdfPreviews>
          </PageSheet>
        </main>
      </div>
    </>
  )
}
