import { DownloadSimpleIcon } from "@phosphor-icons/react/ssr"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { PdfPreviewField, PdfPreviews } from "@/components/pdf-preview-field"
import { Button } from "@/components/ui/button"
import { ARCHIVE } from "@/lib/archive"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { ensureToolsRegistered, registeredTools } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { archiveOf } from "@/server/pdf/archive"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"

import { projectNav } from "../sidebar"

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
            {`${ARCHIVE} ${overview.name}`}
          </BackLink>
          <PageSheet title="Contract archive">
            <PdfPreviews states={states}>
              <ul className="flex flex-col gap-3">
                {documents.map((document) => (
                  <li
                    key={document.key}
                    className="tile flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {document.state.name}
                      </span>
                      <span className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                        {document.fileName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <PdfPreviewField
                        id={`archive-${document.key}`}
                        field={{
                          key: document.key,
                          label: document.state.name,
                        }}
                      />
                      {document.state.status === "ready" && (
                        <Button asChild variant="outline" className="h-12">
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
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </PdfPreviews>
          </PageSheet>
        </main>
      </div>
    </>
  )
}
