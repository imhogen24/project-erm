import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { ClientRequestPanel } from "@/components/client-request-panel"
import { MobileBar } from "@/components/mobile-bar"
import { RecordForm } from "@/components/record-form"
import { ClientRequestForm } from "@/components/client-request-form"
import { ClientRequestTables } from "@/components/client-request-tables"
import { ToolSheet } from "@/components/tool-sheet"
import { TriageScreen } from "@/components/triage-screen"
import { triagePayload } from "@/lib/triage"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import type { FormValues } from "@/lib/tool-definition"
import { registeredTools } from "@/lib/tools"
import {
  ACKNOWLEDGEMENT,
  acknowledgementDraft,
  missingToSend,
  sendableOf,
} from "@/server/acknowledgement/acknowledgement"
import { getDatabase } from "@/server/database"
import { clientAnswersOf } from "@/server/intake/client-requests"
import { getClientRequestPreview } from "@/server/intake/preview"
import { getRequestDetails } from "@/server/intake/request-details"
import type { DocumentControl } from "@/server/document-control/document-control"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"
import { getRecordScreen } from "@/server/records/screen"
import { UnknownToolError } from "@/server/records/validate"

import {
  approveRecordAction,
  saveDraftAction,
  signFieldAction,
  submitRecordAction,
  resubmitClientRequestAction,
  sendAcknowledgementAction,
} from "./actions"
import { projectNav } from "../../sidebar"

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

// Short, so the document control fits one row. Every time is UTC, which is
// also Ghana's local time, the zone the people using the ERM work in.
function time(value: Date | null) {
  return value ? when.format(value) : "-"
}

function duration(seconds: number | null) {
  if (seconds === null) {
    return ""
  }

  const minutes = Math.round(seconds / 60)

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) {
    return ` (${minutes} min)`
  }

  return rest === 0 ? ` (${hours} h)` : ` (${hours} h ${rest} min)`
}

// A person in the document control: the name, with the role as a badge.
function person(who: DocumentControl["preparedBy"]) {
  if (!who) {
    return { value: "Not assigned" }
  }

  return { value: who.name, badge: who.role ?? undefined }
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

  // A tool cannot be opened until the tool before it is locked. Its address
  // leads back to the project, where its tile says what it waits on.
  if (view.waiting) {
    redirect(`/projects/${projectId}`)
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

  // D1.1 is the client's web form. Everyone who may read it sees the answers.
  // The client changes it only after a change request was approved, when it
  // is a draft again.
  const webForm = toolId === "D1.1"

  const editingWebForm =
    webForm && view.state === "draft" && view.can.write
      ? await clientAnswersOf(getDatabase(), session.user.id, projectId)
      : null

  // D1.2 has its own screen: the files, the three checks and the decision. It
  // opens before D1.2 has a record, for the person who may write it.
  const triage =
    toolId === "D1.2" && details && (hasRecord || view.can.write)
      ? details
      : null

  // D1.4 starts from the standard email, filled in from the web request, and
  // shows the client's address. Nothing is saved until the OM edits it. The
  // person who may approve D1.4, the PM, sends it.
  let formValues = values

  let send:
    { missing: string[]; run: typeof sendAcknowledgementAction } | undefined

  if (toolId === ACKNOWLEDGEMENT) {
    const draft = await acknowledgementDraft(getDatabase(), projectId)

    formValues = {
      ...(view.record ? values : { subject: draft.subject, body: draft.body }),
      // Once sent, what was recorded; before, the web request's address and
      // the project's OM.
      sentTo:
        sendableOf(view.record?.payload ?? {}).sentTo ?? draft.sentTo ?? "",
      sentBy:
        sendableOf(view.record?.payload ?? {}).sentBy ?? draft.sentBy ?? "",
    }

    const mayStillSend =
      view.project.status === "active" &&
      (view.state === "draft" || view.state === "notStarted")

    if (
      mayStillSend &&
      (await can(getDatabase(), session.user.id, projectId, toolId, "approve"))
    ) {
      send = {
        missing: view.record
          ? missingToSend(draft.sentTo, sendableOf(view.record.payload))
          : ["the Onboarding Manager has not started the email yet"],
        run: sendAcknowledgementAction,
      }
    }
  }

  const checks = tool.fields.flatMap((field) =>
    field.type === "table" && field.key === "triageChecklist"
      ? (field.prefilledRows ?? [])
      : []
  )

  const body = editingWebForm ? (
    <ClientRequestForm
      track={editingWebForm.track}
      saved={editingWebForm.answers}
      submitLabel="Send the changes"
      submit={async (answers) => {
        "use server"

        return resubmitClientRequestAction({ projectId, answers })
      }}
    />
  ) : webForm ? (
    <div className="flex flex-col gap-8">
      {clientRequest ? (
        <ClientRequestTables request={clientRequest} />
      ) : (
        <p className="text-muted-foreground">This project has no web form.</p>
      )}
      {view.record && (
        <RecordForm
          tool={tool}
          projectId={projectId}
          cycle={view.cycle}
          values={values}
          recordId={view.record.id}
          updatedAt={view.record.updatedAt.toISOString()}
          canWrite={false}
          canApprove={false}
          signable={[]}
          save={saveDraftAction}
          submit={submitRecordAction}
          sign={signFieldAction}
          approve={approveRecordAction}
        />
      )}
    </div>
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
  ) : !hasRecord && !view.can.write && !send ? (
    <p>Nobody has started this tool yet.</p>
  ) : (
    <div className="flex flex-col gap-6">
      <RecordForm
        tool={tool}
        projectId={projectId}
        cycle={view.cycle}
        values={formValues}
        recordId={view.record?.id}
        updatedAt={view.record?.updatedAt.toISOString()}
        canWrite={view.can.write}
        canApprove={view.can.approve}
        signable={view.can.sign}
        save={saveDraftAction}
        submit={submitRecordAction}
        sign={signFieldAction}
        approve={approveRecordAction}
        send={send}
      />
    </div>
  )

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar
          name={session.user.name}
          canInvite={canInvite}
          project={overview ? projectNav(overview) : undefined}
        />
        <main className="table-wide table-home">
          <ToolSheet
            columns={Math.max(
              2,
              ...tool.fields.map((field) =>
                field.type === "table" ? field.columns.length : 2
              )
            )}
            topBar={{
              title: `${view.toolId} ${view.toolName}`,
              iteration: view.control?.iteration,
              state: view.state,
              action:
                clientRequest && !webForm ? (
                  <ClientRequestPanel request={clientRequest} />
                ) : undefined,
              projectHref: `/projects/${projectId}`,
              projectName: view.project.name,
              tier: overview?.serviceTrack.replace("_", " "),
              requestId:
                view.control?.requestId ??
                clientRequest?.requestId ??
                undefined,
              control: view.control
                ? [
                    {
                      label: "Prepared by",
                      ...person(view.control.preparedBy),
                    },
                    { label: "Checked by", ...person(view.control.checkedBy) },
                    {
                      label: "Date checked",
                      value: time(view.control.checkedAt),
                    },
                    {
                      label: "Date approved",
                      value: time(view.control.approvedAt),
                    },
                    {
                      label: "Started",
                      value: time(view.control.startedAt),
                    },
                    {
                      label: "Completed",
                      value: time(view.control.completedAt),
                      badge:
                        duration(view.control.durationSeconds)
                          .trim()
                          .slice(1, -1) || undefined,
                    },
                  ]
                : [
                    "Prepared by",
                    "Checked by",
                    "Date checked",
                    "Date approved",
                    "Started",
                    "Completed",
                  ].map((label) => ({ label, value: "-" })),
            }}
          >
            {body}
          </ToolSheet>
        </main>
      </div>
    </>
  )
}
