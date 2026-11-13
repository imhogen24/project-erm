import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { z } from "zod"

import { recordStates, type RecordState } from "@/db/schema"

import { AppSidebar } from "@/components/app-sidebar"
import { CalendarAgendaScreen } from "@/components/calendar-agenda-screen"
import { ClientRequestPanel } from "@/components/client-request-panel"
import { DeliveryChip } from "@/components/delivery-chip"
import { MeetingChoice } from "@/components/meeting-choice"
import { MeetingProposalScreen } from "@/components/meeting-proposal-screen"
import { MobileBar } from "@/components/mobile-bar"
import { RecordForm } from "@/components/record-form"
import { ClientRequestForm } from "@/components/client-request-form"
import { ClientRequestTables } from "@/components/client-request-tables"
import { RetryEmail } from "@/components/retry-email"
import { ToolSheet } from "@/components/tool-sheet"
import { TriageScreen } from "@/components/triage-screen"
import { clientFilesPayload } from "@/lib/client-files"
import { triagePayload } from "@/lib/triage"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import type { FormValues, ToolDefinition } from "@/lib/tool-definition"
import { registeredTools } from "@/lib/tools"
import {
  ACKNOWLEDGEMENT,
  acknowledgementDraft,
  missingToSend,
  sendableOf,
} from "@/server/acknowledgement/acknowledgement"
import { acknowledgementDelivery } from "@/server/acknowledgement/delivery"
import { getDatabase } from "@/server/database"
import { clientAnswersOf } from "@/server/intake/client-requests"
import { getClientRequestPreview } from "@/server/intake/preview"
import { agendaOf } from "@/lib/calendar-agenda"
import { notesStart } from "@/lib/meeting-notes"
import {
  CALENDAR_AGENDA,
  clientAttendees,
  meetingDetails,
  projectTeam,
} from "@/server/meetings/calendar-invite"
import {
  MEETING_PROPOSAL,
  proposalOf,
  schedulingContext,
} from "@/server/meetings/meeting-proposal"
import { getRequestDetails } from "@/server/intake/request-details"
import { MEETING_NOTES, lockedCalendar } from "@/server/meetings/meeting-notes"
import type { DocumentControl } from "@/server/document-control/document-control"
import {
  PermissionDeniedError,
  can,
  rolesOn,
} from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"
import {
  NEEDS_ASSESSMENT,
  clientTechnicalAnswers,
  synthesisValues,
} from "@/server/needs/needs-assessment"
import { hiddenFromClient, sentBackReason } from "@/server/records/records"
import {
  INTERNAL_REVIEW,
  reviewStart,
  reviewValues,
} from "@/server/review/internal-review"
import { getRecordScreen } from "@/server/records/screen"
import { UnknownToolError } from "@/server/records/validate"

import {
  approveRecordAction,
  chooseMeetingTimeAction,
  confirmMeetingAction,
  proposeMeetingTimeAction,
  readyForMeetingAction,
  saveDraftAction,
  sendBackRecordAction,
  sendCalendarInviteAction,
  sendMeetingTimesAction,
  signFieldAction,
  submitRecordAction,
  resubmitClientRequestAction,
  sendAcknowledgementAction,
  retryAcknowledgementAction,
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

// A record's state as stored. The screen's "notStarted" has no record.
function toState(state: string): RecordState {
  return recordStates.find((each) => each === state) ?? "draft"
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

  // Once sent, D1.4 shows whether the client got it. After a bounce, or no
  // answer in time, the PM corrects the address and retries; everyone else
  // is told the PM knows.
  let deliveryChip: ReactNode

  let deliveryBox: ReactNode

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

    const delivery =
      view.record && view.state === "locked"
        ? await acknowledgementDelivery(getDatabase(), view.record.id)
        : null

    if (delivery?.status) {
      deliveryChip = <DeliveryChip status={delivery.status} />
    }

    if (view.record && (delivery?.status === "Bounced" || delivery?.retry)) {
      const what =
        delivery.status === "Bounced"
          ? "This email bounced."
          : "Delivery of this email could not be confirmed."

      const mayRetry =
        delivery.retry &&
        view.project.status === "active" &&
        (await can(
          getDatabase(),
          session.user.id,
          projectId,
          toolId,
          "approve"
        ))

      deliveryBox = mayRetry ? (
        <RetryEmail
          recordId={view.record.id}
          sentTo={String(formValues.sentTo ?? "")}
          heading={`${what} Correct the address and try again.`}
          retry={retryAcknowledgementAction}
        />
      ) : (
        <p role="status" data-tone="error" className="note-panel text-sm">
          {what} The Project Manager has been told.
        </p>
      )
    }

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

  // D1.7 starts from D1.6's agenda and invited attendees. Nothing is saved
  // until the OM saves.
  if (toolId === MEETING_NOTES && !view.record && view.can.write) {
    formValues = notesStart(await lockedCalendar(getDatabase(), projectId))
  }

  // D1.8: 1.0 and 4.0 come from who submitted and when, and each 2.0 row
  // shows the client's own technical answer beneath its category.
  let sheetTool: ToolDefinition = tool

  if (toolId === NEEDS_ASSESSMENT) {
    formValues = {
      ...formValues,
      ...(await synthesisValues(
        getDatabase(),
        projectId,
        view.record ? { id: view.record.id, state: toState(view.state) } : null,
        view.can.write ? session.user.name : undefined
      )),
    }

    const answers = await clientTechnicalAnswers(getDatabase(), projectId)

    sheetTool = {
      ...tool,
      fields: tool.fields.map((field) =>
        field.type === "table" && field.key === "constraints"
          ? { ...field, rowNotes: answers }
          : field
      ),
    }
  }

  // D1.9: 1.0 and 2.0 come from the project, its request and its records;
  // the review rows start from the sheet's.
  if (toolId === INTERNAL_REVIEW) {
    if (!view.record && view.can.write) {
      formValues = { ...reviewStart(), ...formValues }
    }

    // SAFETY: the system's values are built for D1.9's own fields.
    const system = (await reviewValues(getDatabase(), projectId)) as FormValues

    formValues = { ...formValues, ...system }
  }

  // A tool the client reads only once locked tells them so until then.
  const notSharedYet =
    tool.clientReadsOnceLocked &&
    view.state !== "locked" &&
    (await hiddenFromClient(getDatabase(), session.user.id, {
      projectId,
      toolId,
      state: "draft",
    }))

  // Why the approver sent the draft back, for the person who writes it.
  const sentBack =
    view.record && view.can.write
      ? await sentBackReason(getDatabase(), {
          id: view.record.id,
          state: "draft",
        })
      : null

  // D1.5: the client chooses a time on their own screen; the IMHOGEN team
  // works on the sheet.
  const meeting =
    toolId === MEETING_PROPOSAL
      ? {
          saved: proposalOf(view.record?.payload ?? {}),
          asClient:
            !view.can.write &&
            (await rolesOn(getDatabase(), session.user.id, projectId)).includes(
              "Client"
            ),
          context: await schedulingContext(getDatabase(), projectId),
        }
      : null

  // D1.6: the meeting from D1.5, the team to choose attendees from, and who
  // attends from the client.
  const agenda =
    toolId === CALENDAR_AGENDA
      ? {
          saved: agendaOf(view.record?.payload ?? {}),
          meeting: await meetingDetails(getDatabase(), projectId),
          team: await projectTeam(getDatabase(), projectId),
          client: (await clientAttendees(getDatabase(), projectId)).map(
            (each) => each.name
          ),
        }
      : null

  const checks = tool.fields.flatMap((field) =>
    field.type === "table" && field.key === "triageChecklist"
      ? (field.prefilledRows ?? [])
      : []
  )

  const body = agenda ? (
    <CalendarAgendaScreen
      projectId={projectId}
      cycle={view.cycle}
      recordId={view.record?.id}
      updatedAt={view.record?.updatedAt.toISOString()}
      saved={agenda.saved}
      meeting={agenda.meeting}
      team={agenda.team.map(({ personId, name, roles }) => ({
        personId,
        name,
        roles,
      }))}
      client={agenda.client}
      canWrite={
        view.can.write &&
        view.state !== "locked" &&
        view.project.status === "active"
      }
      save={saveDraftAction}
      sendInvite={sendCalendarInviteAction}
      ready={readyForMeetingAction}
    />
  ) : meeting?.asClient ? (
    <MeetingChoice
      recordId={view.record?.id}
      saved={meeting.saved}
      locked={view.state === "locked"}
      open={view.project.status === "active" && view.state === "draft"}
      choose={chooseMeetingTimeAction}
      propose={proposeMeetingTimeAction}
    />
  ) : meeting && (hasRecord || view.can.write) ? (
    <MeetingProposalScreen
      projectId={projectId}
      cycle={view.cycle}
      recordId={view.record?.id}
      updatedAt={view.record?.updatedAt.toISOString()}
      saved={meeting.saved}
      context={meeting.context}
      canWrite={
        view.can.write &&
        view.state !== "locked" &&
        view.project.status === "active"
      }
      save={saveDraftAction}
      sendTimes={sendMeetingTimesAction}
      confirm={confirmMeetingAction}
    />
  ) : editingWebForm ? (
    <ClientRequestForm
      track={editingWebForm.track}
      saved={editingWebForm.answers}
      savedFiles={clientFilesPayload
        .parse(values)
        .attachedFiles.map((file) => ({
          reference: file.fileLink,
          name: file.label,
        }))}
      submitLabel="Send the changes"
      submit={async (answers, files) => {
        "use server"

        return resubmitClientRequestAction({ projectId, answers, files })
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
  ) : notSharedYet ? (
    <p className="text-muted-foreground">
      IMHOGEN shares these notes with you once they are approved.
    </p>
  ) : !hasRecord && !view.can.write && !send ? (
    <p>Nobody has started this tool yet.</p>
  ) : (
    <div className="flex flex-col gap-6">
      {deliveryBox}
      <RecordForm
        tool={sheetTool}
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
        sendBack={sendBackRecordAction}
        sentBack={sentBack ?? undefined}
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
              badges: deliveryChip,
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
