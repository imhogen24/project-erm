import { notFound } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { ClientRequestPanel } from "@/components/client-request-panel"
import { MobileBar } from "@/components/mobile-bar"
import { RecordForm } from "@/components/record-form"
import { ReviewScreen } from "@/components/review-screen"
import { ToolSheet } from "@/components/tool-sheet"
import { TriageScreen } from "@/components/triage-screen"
import { reviewPayload } from "@/lib/review"
import { triagePayload } from "@/lib/triage"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import type { FormValues } from "@/lib/tool-definition"
import { registeredTools } from "@/lib/tools"
import { getDatabase } from "@/server/database"
import { getClientRequestPreview } from "@/server/intake/preview"
import { getRequestDetails } from "@/server/intake/request-details"
import type { DocumentControl } from "@/server/document-control/document-control"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"
import { getRecordScreen } from "@/server/records/screen"
import { UnknownToolError } from "@/server/records/validate"

import {
  approveRecordAction,
  saveDraftAction,
  setReviewStatusAction,
  signFieldAction,
  submitRecordAction,
  submitReviewAction,
} from "./actions"
import { projectNav } from "../../sidebar"

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

  // The sidebar's tree of the project's tools.
  let overview = null

  try {
    overview = await getProjectOverview(
      getDatabase(),
      session.user.id,
      projectId,
      registeredTools
    )
  } catch (error) {
    if (!(error instanceof PermissionDeniedError)) {
      throw error
    }
  }

  const clientRequest = await getClientRequestPreview(
    getDatabase(),
    session.user.id,
    projectId
  )

  // D1.2 shows where the request came from, read live, whether or not it has
  // a record yet.
  const details =
    toolId === "D1.2"
      ? await getRequestDetails(getDatabase(), session.user.id, projectId)
      : null

  const hasRecord = view.record !== null

  // SAFETY: a saved payload was checked against the tool's definition when it
  // was written, so each value has the type its field holds.
  const values = (view.record?.payload ?? {}) as FormValues

  // D1.1 is reviewed on its own screen once it has a record. The OM switches the
  // statuses while it is a draft, and everyone else reads them.
  const review =
    toolId === "D1.1" && view.record && !view.waiting ? view.record : null

  // D1.2 has its own screen: the files, the three checks and the decision. It
  // opens before D1.2 has a record, for the person who may write it.
  const triage =
    toolId === "D1.2" &&
    details &&
    !view.waiting &&
    (hasRecord || view.can.write)
      ? details
      : null

  const checks = tool.fields.flatMap((field) =>
    field.type === "table" && field.key === "triageChecklist"
      ? (field.prefilledRows ?? [])
      : []
  )

  const body = view.waiting ? (
    <p>
      {view.waiting.waitingOn.length > 0
        ? `This tool opens after ${view.waiting.waitingOn.join(", ")} is approved.`
        : `This tool cannot be started yet: ${view.waiting.missing.join("; ")}.`}
    </p>
  ) : review ? (
    <ReviewScreen
      key={review.updatedAt.toISOString()}
      recordId={review.id}
      requestStatus={reviewPayload.parse(review.payload).requestStatus}
      files={reviewPayload.parse(review.payload).attachedFiles}
      canReview={view.can.review}
      canApprove={view.can.approve}
      setStatus={setReviewStatusAction}
      submit={submitReviewAction}
      approve={approveRecordAction}
    />
  ) : triage ? (
    <TriageScreen
      projectId={projectId}
      cycle={view.cycle}
      recordId={view.record?.id}
      updatedAt={view.record?.updatedAt.toISOString()}
      files={triage.files}
      filesRecordId={triage.filesRecordId}
      checks={checks}
      saved={triagePayload.parse(view.record?.payload ?? {})}
      tier3={overview?.serviceTrack === "Tier_3"}
      canWrite={view.can.write}
      canApprove={view.can.approve}
      save={saveDraftAction}
      submit={submitRecordAction}
      approve={approveRecordAction}
    />
  ) : !hasRecord && !view.can.write ? (
    <p>Nobody has started this tool yet.</p>
  ) : (
    <div className="flex max-w-3xl flex-col gap-6">
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
    </div>
  )

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar
          name={session.user.name}
          canInvite={canInvite}
          project={overview ? projectNav(overview) : undefined}
        />
        <main className="table-wide table-home">
          <ToolSheet
            backHref={`/projects/${projectId}`}
            backLabel="Project overview"
            title={`${view.toolId} ${view.toolName}`}
            state={view.state}
            statusLine={
              view.state === "notStarted" ? undefined : statusLine[view.state]
            }
            action={
              clientRequest ? (
                <ClientRequestPanel request={clientRequest} />
              ) : undefined
            }
            facts={[
              { label: "Project", value: view.project.name },
              {
                label: "Request ID",
                value:
                  view.control?.requestId ?? clientRequest?.requestId ?? "-",
              },
              {
                label: "Prepared by",
                value: view.control ? person(view.control.preparedBy) : "-",
              },
              {
                label: "Checked by",
                value: view.control ? person(view.control.checkedBy) : "-",
              },
              {
                label: "Started",
                value: view.control ? time(view.control.startedAt) : "-",
              },
              {
                label: "Completed",
                value: view.control
                  ? `${time(view.control.completedAt)}${duration(view.control.durationSeconds)}`
                  : "-",
              },
            ]}
          >
            {body}
          </ToolSheet>
        </main>
      </div>
    </>
  )
}
