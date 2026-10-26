import { notFound } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { RecordForm } from "@/components/record-form"
import { StateBadge } from "@/components/state-badge"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import type { FormValues } from "@/lib/tool-definition"
import { registeredTools } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import type { DocumentControl } from "@/server/document-control/document-control"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getRecordScreen } from "@/server/records/screen"
import { UnknownToolError } from "@/server/records/validate"

import {
  approveRecordAction,
  saveDraftAction,
  signFieldAction,
  submitRecordAction,
} from "./actions"

const square = "grid-square relative isolate bg-background"

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

function time(value: Date | null) {
  return value ? `${when.format(value)} UTC` : "-"
}

function duration(seconds: number | null) {
  if (seconds === null) {
    return ""
  }

  const minutes = Math.round(seconds / 60)

  return minutes < 60
    ? ` (${minutes} min)`
    : ` (${Math.floor(minutes / 60)} h ${minutes % 60} min)`
}

function person(who: DocumentControl["preparedBy"]) {
  if (!who) {
    return "Not assigned"
  }

  return who.role ? `${who.name} (${who.role})` : who.name
}

const statusLine = {
  notStarted: "Nobody has started this tool yet.",
  draft:
    "This record is a draft. Save it as often as you like, then submit it.",
  submitted: "Submitted. It is waiting for approval.",
  approved: "Approved.",
  locked: "Locked. This record is final.",
}

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; toolId: string }>
}) {
  const { projectId, toolId } = await params
  const session = await requireSession()

  // An id that cannot be a project looks the same as one that is not found.
  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  let view

  try {
    view = await getRecordScreen(
      getDatabase(),
      session.user.id,
      projectId,
      toolId
    )
  } catch (error) {
    if (
      error instanceof PermissionDeniedError ||
      error instanceof UnknownToolError
    ) {
      notFound()
    }

    throw error
  }

  const tool = registeredTools.find((each) => each.id === toolId)

  if (!tool) {
    notFound()
  }

  const canInvite = await isItAdmin(session.user.id)

  const hasRecord = view.record !== null

  // SAFETY: a saved payload was checked against the tool's definition when it
  // was written, so each value has the type its field holds.
  const values = (view.record?.payload ?? {}) as FormValues

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} canInvite={canInvite} />
        <main className="table-project table-home">
          <div
            className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-3 px-6 py-6`}
          >
            <Grain />
            <BackLink
              href={`/projects/${projectId}`}
              className="-mx-6 -mt-6 mb-auto border-b"
            >
              Project overview
            </BackLink>
            <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-5xl">
              {`${view.toolId} ${view.toolName}`}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <StateBadge state={view.state} />
              <p className="text-sm text-muted-foreground">
                {statusLine[view.state]}
              </p>
            </div>
          </div>
          {view.control && (
            <section
              aria-label="Document control"
              className={`${square} mt-[var(--cell)] px-6 py-6`}
            >
              <Grain />
              <dl className="relative grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="break-words">{view.control.requestId}</dd>
                <dt className="text-muted-foreground">Prepared by</dt>
                <dd>{person(view.control.preparedBy)}</dd>
                <dt className="text-muted-foreground">Checked by</dt>
                <dd>{person(view.control.checkedBy)}</dd>
                <dt className="text-muted-foreground">Started</dt>
                <dd>{time(view.control.startedAt)}</dd>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>
                  {time(view.control.completedAt)}
                  {duration(view.control.durationSeconds)}
                </dd>
              </dl>
            </section>
          )}
          <div className={`${square} mt-[var(--cell)] px-6 py-8`}>
            <Grain />
            <div className="relative flex max-w-3xl flex-col gap-6">
              {view.waiting ? (
                <p>
                  {view.waiting.waitingOn.length > 0
                    ? `This tool opens after ${view.waiting.waitingOn.join(", ")} is approved.`
                    : `This tool cannot be started yet: ${view.waiting.missing.join("; ")}.`}
                </p>
              ) : !hasRecord && !view.can.write ? (
                <p>Nobody has started this tool yet.</p>
              ) : (
                <>
                  {hasRecord && !view.can.write && (
                    <p className="text-sm text-muted-foreground">
                      This record is read only.
                    </p>
                  )}
                  <RecordForm
                    tool={tool}
                    projectId={projectId}
                    cycle={view.cycle}
                    values={values}
                    recordId={view.record?.id}
                    updatedAt={view.record?.updatedAt.toISOString()}
                    canWrite={view.can.write}
                    canApprove={view.can.approve}
                    signable={view.can.sign}
                    save={saveDraftAction}
                    submit={submitRecordAction}
                    sign={signFieldAction}
                    approve={approveRecordAction}
                  />
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
