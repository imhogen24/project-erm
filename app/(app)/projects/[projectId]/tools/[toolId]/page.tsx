import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { z } from "zod"

import { recordStates, type RecordState } from "@/db/schema"

import { AppSidebar } from "@/components/app-sidebar"
import { CalendarAgendaScreen } from "@/components/calendar-agenda-screen"
import { ClientRequestPanel } from "@/components/client-request-panel"
import { DeliveryChip } from "@/components/delivery-chip"
import { EmptyState } from "@/components/empty-state"
import { MeetingChoice } from "@/components/meeting-choice"
import { MeetingProposalScreen } from "@/components/meeting-proposal-screen"
import { MobileBar } from "@/components/mobile-bar"
import { PdfPreviews } from "@/components/pdf-preview-field"
import { RecordComments } from "@/components/record-comments"
import { RecordForm } from "@/components/record-form"
import { RequestChange } from "@/components/request-change"
import { SheetActions } from "@/components/sheet-actions"
import { WithdrawRecord } from "@/components/withdraw-record"
import { ClientRequestForm } from "@/components/client-request-form"
import {
  ClientRequestTables,
  type ChangedFile,
} from "@/components/client-request-tables"
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
import { isCyclePaid } from "@/server/payments/reconciled-submit"
import {
  clientAnswersOf,
  clientChangesOf,
  type ClientChanges,
} from "@/server/intake/client-requests"
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
} from "@/server/needs/needs-assessment"
import {
  hiddenFromClient,
  recordViewed,
  sentBackReason,
} from "@/server/records/records"
import { SCOPE_OF_WORK, clientMeeting } from "@/server/scope/scope-of-work"
import { AlignmentMeetingActions } from "@/components/alignment-meeting-actions"
import { roleList } from "@/lib/role-titles"
import { writingRoles } from "@/server/permissions/matrix"
import {
  missingToConfirm,
  missingToSendTimes,
  proposalOf as meetingOf,
} from "@/lib/meeting-proposal"
import { FEASIBILITY, feasibilityStart } from "@/server/feasibility/feasibility"
import { COST_ESTIMATION } from "@/lib/cost-estimation"
import { costStart } from "@/server/cost/cost-estimation"
import { PROJECT_BRIEF, T3_QUOTE } from "@/lib/project-brief"
import { HANDOFF } from "@/lib/handoff"
import { handoffStart } from "@/server/handoff/handoff"
import { briefStart, quoteStart } from "@/server/brief/project-brief"
import { STANDARD_CONTRACT } from "@/lib/standard-contract"
import { contractStart } from "@/server/contract/standard-contract"
import { INITIAL_DRAFT } from "@/lib/initial-draft"
import { draftStart } from "@/server/contract/initial-draft"
import { PM_REVIEW } from "@/lib/pm-review"
import { pmReviewStart } from "@/server/contract/pm-review"
import { FINANCE_REVIEW } from "@/lib/finance-review"
import { financeReviewStart } from "@/server/contract/finance-review"
import { EXECUTIVE_REVIEW } from "@/lib/executive-review"
import { executiveReviewStart } from "@/server/contract/executive-review"
import { BASELINE } from "@/lib/baseline"
import { baselineStart } from "@/server/contract/baseline"
import { TRANSMITTAL } from "@/lib/transmittal"
import {
  missingToSend as transmittalMissing,
  transmittalStart,
} from "@/server/contract/transmittal"
import { NEGOTIATION_INVITE } from "@/lib/negotiation-invite"
import { NEGOTIATION_NOTES } from "@/lib/negotiation-notes"
import { FINAL_CONTRACT } from "@/lib/final-contract"
import { SIGNATURE_CONTRACT } from "@/lib/signature-contract"
import { EXECUTED_CONTRACT } from "@/lib/executed-contract"
import { INITIATION } from "@/lib/initiation"
import { initiationStart } from "@/server/contract/initiation"
import { PAYMENT_TERMS } from "@/lib/payment-terms"
import { paymentTermsStart } from "@/server/payments/payment-terms"
import { DRAFT_INVOICE } from "@/lib/draft-invoice"
import { draftInvoiceStart } from "@/server/payments/draft-invoice"
import {
  executedStart,
  startExecutedRecord,
} from "@/server/contract/executed-contract"
import {
  signatureMissing,
  signatureStart,
} from "@/server/contract/signature-contract"
import { finalContractStart } from "@/server/contract/final-contract"
import { negotiationNotesStart } from "@/server/contract/negotiation-notes"
import {
  missingToInvite as negotiationMissing,
  negotiationInviteStart,
} from "@/server/contract/negotiation-invite"
import { clientAttendees as inviteesFromClient } from "@/server/meetings/calendar-invite"
import { KICKOFF_INVITE } from "@/lib/kickoff-invite"
import {
  hasRosteredEngineers,
  kickoffInviteStart,
  missingToKickoff,
} from "@/server/team/kickoff-invite"
import { KICKOFF_NOTES } from "@/lib/kickoff-notes"
import { kickoffMinutesStart } from "@/server/team/kickoff-notes"
import {
  readsAsClient,
  toolAsShown,
  withoutInternalValues,
} from "@/server/records/shown-fields"
import { fieldsOff, withoutFieldsOff } from "@/server/records/only-when"
import { systemFillsOf } from "@/server/records/fills"
import { previewStates } from "@/server/pdf/previews"
import { getRecordScreen } from "@/server/records/screen"
import { firstFree, liveOptionsOf } from "@/server/records/options-from"
import { BILLING_TRIGGER } from "@/lib/billing-trigger"
import { milestoneValueOptions } from "@/server/payments/billing-trigger"
import { CycleList } from "@/components/cycle-list"
import { InvoiceFile } from "@/components/invoice-file"
import { PaidBadge } from "@/components/paid-badge"
import { APPROVED_INVOICE, invoicePath } from "@/lib/approved-invoice"
import { shownInvoice } from "@/server/payments/approved-invoice"
import { TRANSMITTED_INVOICE } from "@/lib/transmitted-invoice"
import { fillText } from "@/lib/placeholders"
import { transmittedInvoiceStart } from "@/server/payments/transmitted-invoice"
import { PAYMENT_RECEIPT, receiptPath } from "@/lib/payment-receipt"
import {
  paymentReceiptStart,
  shownReceipt,
} from "@/server/payments/payment-receipt"
import { UNBLOCK_NOTICE } from "@/lib/unblock-notice"
import { TECHNICAL_NOTES } from "@/lib/technical-notes"
import { technicalNotesStart } from "@/server/team/technical-notes"
import { RESOURCE_REQUEST } from "@/lib/resource-request"
import { resourceRequestStart } from "@/server/team/resource-request"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import { assignmentStart } from "@/server/team/team-assignment"
import { withPeopleOptions } from "@/server/records/people-options"
import { unblockStart } from "@/server/payments/unblock-notice"
import { systemValuesOf } from "@/server/records/system-values"
import { listComments, type Comment } from "@/server/comments/comments"
import { UnknownToolError } from "@/server/records/validate"

import {
  approveRecordAction,
  chooseMeetingTimeAction,
  confirmMeetingAction,
  proposeMeetingTimeAction,
  readyForMeetingAction,
  saveDraftAction,
  sendAlignmentInviteAction,
  sendBackRecordAction,
  sendCalendarInviteAction,
  sendMeetingTimesAction,
  signFieldAction,
  submitRecordAction,
  withdrawRecordAction,
  resubmitClientRequestAction,
  sendAcknowledgementAction,
  sendSignatureRequestAction,
  sendTransmittalAction,
  sendTransmittedInvoiceAction,
  sendPaymentReceiptAction,
  sendNegotiationInviteAction,
  sendKickoffInviteAction,
  retryAcknowledgementAction,
} from "./actions"
import { requestChangeAction } from "../../actions"

import { addCommentAction, resolveCommentAction } from "./comment-actions"
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

// D1.1's files the client added or took off the last time they sent it again,
// by name. An added file is named from D1.1's current list.
function changedFilesOf(
  changes: ClientChanges | null,
  values: FormValues
): ChangedFile[] {
  if (!changes) {
    return []
  }

  const current = clientFilesPayload.parse(values).attachedFiles

  const removed = clientFilesPayload.parse({
    attachedFiles: changes.removedFiles,
  }).attachedFiles

  return [
    ...current
      .filter((file) => changes.addedFiles.includes(file.fileLink))
      .map((file) => ({ name: file.label, change: "Added" as const })),
    ...removed.map((file) => ({
      name: file.label,
      change: "Removed" as const,
    })),
  ]
}

// What a tool with no record yet starts its writer from. Empty for a tool
// that starts blank.
async function startOf(
  toolId: string,
  projectId: string,
  writer: { id: string; name: string },
  cycle: number
): Promise<FormValues> {
  switch (toolId) {
    case FEASIBILITY: {
      // SAFETY: the start is built for this tool's own fields.
      return (await feasibilityStart(getDatabase(), projectId)) as FormValues
    }

    case COST_ESTIMATION: {
      // SAFETY: the start is built for this tool's own fields.
      return (await costStart(getDatabase(), projectId)) as FormValues
    }

    case PROJECT_BRIEF: {
      // SAFETY: the start is built for this tool's own fields.
      return (await briefStart(getDatabase(), projectId)) as FormValues
    }

    case T3_QUOTE: {
      // SAFETY: the start is built for this tool's own fields.
      return quoteStart() as FormValues
    }

    case HANDOFF: {
      // SAFETY: the start is built for this tool's own fields.
      return (await handoffStart(getDatabase(), projectId)) as FormValues
    }

    case STANDARD_CONTRACT: {
      // SAFETY: the start is built for this tool's own fields.
      return (await contractStart(getDatabase(), projectId)) as FormValues
    }

    case INITIAL_DRAFT: {
      // SAFETY: the start is built for this tool's own fields.
      return (await draftStart(getDatabase(), projectId)) as FormValues
    }

    case PM_REVIEW: {
      // SAFETY: the start is built for this tool's own fields.
      return (await pmReviewStart(getDatabase(), projectId)) as FormValues
    }

    case FINANCE_REVIEW: {
      // SAFETY: the start is built for this tool's own fields.
      return financeReviewStart() as FormValues
    }

    case EXECUTIVE_REVIEW: {
      // SAFETY: the start is built for this tool's own fields.
      return executiveReviewStart() as FormValues
    }

    case BASELINE: {
      // SAFETY: the start is built for this tool's own fields.
      return (await baselineStart(getDatabase(), projectId)) as FormValues
    }

    case TRANSMITTAL: {
      // SAFETY: the start is built for this tool's own fields.
      return (await transmittalStart(getDatabase(), projectId)) as FormValues
    }

    case NEGOTIATION_INVITE: {
      const start = await negotiationInviteStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case KICKOFF_INVITE: {
      const start = await kickoffInviteStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case KICKOFF_NOTES: {
      const start = await kickoffMinutesStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case NEGOTIATION_NOTES: {
      const start = await negotiationNotesStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case FINAL_CONTRACT: {
      const start = await finalContractStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case SIGNATURE_CONTRACT: {
      const start = await signatureStart(getDatabase(), projectId, writer.name)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case EXECUTED_CONTRACT: {
      const start = await executedStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case INITIATION: {
      const start = await initiationStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case PAYMENT_TERMS: {
      const start = await paymentTermsStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case DRAFT_INVOICE: {
      const start = await draftInvoiceStart(getDatabase(), projectId, cycle)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case TRANSMITTED_INVOICE: {
      const start = await transmittedInvoiceStart(
        getDatabase(),
        projectId,
        cycle
      )

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case PAYMENT_RECEIPT: {
      const start = await paymentReceiptStart(getDatabase(), projectId, cycle)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case UNBLOCK_NOTICE: {
      const start = await unblockStart(getDatabase(), projectId, cycle)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case TECHNICAL_NOTES: {
      const start = await technicalNotesStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case RESOURCE_REQUEST: {
      const start = await resourceRequestStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    case TEAM_ASSIGNMENT: {
      const start = await assignmentStart(getDatabase(), projectId)

      // SAFETY: the start is built for this tool's own fields.
      return start as FormValues
    }

    default: {
      return {}
    }
  }
}

// A comment as the screen shows it, with its time as text.
function shownComment(comment: Comment) {
  return {
    id: comment.id,
    authorName: comment.authorName,
    authorRole: comment.authorRole,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; toolId: string }>
  searchParams: Promise<{ cycle?: string | string[] }>
}) {
  const { projectId, toolId } = await params
  const session = await requireSession()

  // A tool run once per payment milestone names the milestone's cycle in the
  // address, such as ?cycle=2. Anything else shows the cycle in progress.
  const cycle = z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .catch(undefined)
    .parse((await searchParams).cycle)

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
      toolId,
      cycle
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

  // D2.12 after a contract signed in the app starts its draft, the first
  // time the CA opens it, with the signed contract and signing log the app
  // makes. The screen is read again either way, since someone else may have
  // started it meanwhile.
  if (toolId === EXECUTED_CONTRACT && !view.record && view.can.write) {
    await startExecutedRecord(getDatabase(), session.user.id, projectId)

    view = await getRecordScreen(
      getDatabase(),
      session.user.id,
      projectId,
      toolId,
      cycle
    )
  }

  // The signer whose turn it is opening the record for the first time once
  // it can be signed, such as the client on D2.11, is kept as when they
  // viewed it.
  if (
    view.record &&
    (await recordViewed(getDatabase(), session.user.id, view.record.id))
  ) {
    view = await getRecordScreen(
      getDatabase(),
      session.user.id,
      projectId,
      toolId,
      cycle
    )
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

  // D1.1 marks what the client changed the last time they sent it again,
  // until the next change request is approved. Whoever reached this screen
  // may read D1.1.
  const clientChanges =
    toolId === "D1.1" && view.state === "locked"
      ? await clientChangesOf(getDatabase(), session.user.id, projectId)
      : null

  const clientRequest = await getClientRequestPreview(
    getDatabase(),
    session.user.id,
    projectId,
    clientChanges?.answers
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
    | {
        missing: string[]
        run:
          | typeof sendAcknowledgementAction
          | typeof sendTransmittalAction
          | typeof sendNegotiationInviteAction
          | typeof sendKickoffInviteAction
          | typeof sendSignatureRequestAction
          | typeof sendTransmittedInvoiceAction
          | typeof sendPaymentReceiptAction
        label?: string
        done?: string
      }
    | undefined

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

  // D2.7: the CA sends the draft contract while D2.7 is a draft not yet
  // sent. Once sent, D2.7 waits for the client's reply.
  if (
    toolId === TRANSMITTAL &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted") &&
    !view.record?.payload.sentBy
  ) {
    const { sentTo } = await acknowledgementDraft(getDatabase(), projectId)

    send = {
      missing: view.record
        ? transmittalMissing(sentTo, view.record.payload)
        : ["choose whether to follow up after 3 days"],
      run: sendTransmittalAction,
    }
  }

  // D2.11: the CA sends the final contract for signature while D2.11 is a
  // draft not yet sent. Once sent, it waits for the signatures.
  if (
    toolId === SIGNATURE_CONTRACT &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted") &&
    !view.record?.payload.dispatchConfirmed
  ) {
    send = {
      missing: await signatureMissing(
        getDatabase(),
        projectId,
        view.record?.payload ?? {}
      ),
      run: sendSignatureRequestAction,
      done: "Sent for signature.",
    }
  }

  // D3.6: the FO sends the approved invoice while D3.6 is a draft, which
  // locks it. With no record yet, Send saves the starting values first.
  // Sent To and the message change as the FO types, so the server says
  // what still stops it when Send is pressed.
  if (
    toolId === TRANSMITTED_INVOICE &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted")
  ) {
    send = {
      missing: [],
      run: sendTransmittedInvoiceAction,
      label: "Send invoice",
      done: "Invoice sent.",
    }
  }

  // D3.9: the FO sends the payment receipt while D3.9 is a draft, which
  // locks it. With no record yet, Send saves the starting values first,
  // which gives the receipt its number.
  if (
    toolId === PAYMENT_RECEIPT &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted")
  ) {
    send = {
      missing: [],
      run: sendPaymentReceiptAction,
      label: "Send receipt",
      done: "Receipt sent.",
    }
  }

  // D2.8: the CA sends the meeting's calendar invite while D2.8 is a draft,
  // and again after changing 1.0, which updates the same meeting.
  if (
    toolId === NEGOTIATION_INVITE &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted")
  ) {
    const hasClient =
      (await inviteesFromClient(getDatabase(), projectId)).length > 0

    send = {
      missing: negotiationMissing(
        view.record?.payload ?? {},
        new Date(),
        hasClient
      ),
      run: sendNegotiationInviteAction,
      label: "Send calendar invite",
      done: "Invite sent.",
    }
  }

  // D4.6: the PM sends the kick-off invite to D4.3's rostered engineers
  // while D4.6 is a draft, and again after a change, which updates the same
  // meeting.
  if (
    toolId === KICKOFF_INVITE &&
    view.project.status === "active" &&
    view.can.write &&
    (view.state === "draft" || view.state === "notStarted")
  ) {
    send = {
      missing: missingToKickoff(
        view.record?.payload ?? {},
        new Date(),
        await hasRosteredEngineers(getDatabase(), projectId)
      ),
      run: sendKickoffInviteAction,
      label: "Send invite",
      done: "Invite sent.",
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

  // Once what a tool sends has gone, such as D2.7's email, the fields it
  // sent read as text, as the system's do.
  const frozen = tool.freezesOnceSet

  if (frozen && view.record?.payload[frozen.field] !== undefined) {
    sheetTool = {
      ...tool,
      fields: tool.fields.map((field) =>
        frozen.fields.includes(field.key) && field.type !== "table"
          ? { ...field, systemFilled: true }
          : field
      ),
    }
  }

  if (toolId === NEEDS_ASSESSMENT) {
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

  // D1.13: the scope's metadata and routing are the system's. The client
  // chooses the alignment meeting's time on their own screen; the LE gets the
  // meeting's buttons beside the sheet.
  const alignment =
    toolId === SCOPE_OF_WORK
      ? await clientMeeting(getDatabase(), session.user.id, projectId)
      : null

  let meetingActions: ReactNode

  if (toolId === SCOPE_OF_WORK) {
    if (
      view.can.write &&
      view.state !== "locked" &&
      view.project.status === "active"
    ) {
      const saved = meetingOf(view.record?.payload ?? {})

      meetingActions = (
        <AlignmentMeetingActions
          recordId={view.record?.id}
          toSend={missingToSendTimes(saved)}
          toInvite={missingToConfirm(saved)}
          sentToClientAt={saved.sentToClientAt}
          inviteSentAt={saved.inviteSentAt}
          sendTimes={sendMeetingTimesAction}
          sendInvite={sendAlignmentInviteAction}
        />
      )
    }
  }

  // A select whose options are another tool's rows, such as D3.3's
  // milestones from D3.1, offers the project's rows, with those already
  // taken shown but not pickable; a new record starts on the first free one.
  // D3.3's Contractual Milestone Value follows the milestone picked.
  const live = await liveOptionsOf(
    getDatabase(),
    projectId,
    toolId,
    view.record?.id ?? null
  )

  if (live.size > 0) {
    const valueOf =
      toolId === BILLING_TRIGGER
        ? await milestoneValueOptions(
            getDatabase(),
            projectId,
            live.get("milestone")?.options ?? []
          )
        : undefined

    sheetTool = {
      ...sheetTool,
      fields: sheetTool.fields.map((field) => {
        const options = live.get(field.key)

        if (field.type === "select" && options) {
          return {
            ...field,
            options: options.options,
            systemOptions: options.taken.length > 0 ? options.taken : undefined,
          }
        }

        return valueOf &&
          field.key === "milestoneValue" &&
          field.type === "text"
          ? { ...field, shownFrom: { field: "milestone", values: valueOf } }
          : field
      }),
    }

    if (!view.record && view.can.write) {
      // SAFETY: each value is one of its select's options, a string.
      formValues = { ...(firstFree(live) as FormValues), ...formValues }
    }
  }

  // A select of people, such as D4.2's engineers, lists them as they are now.
  sheetTool = await withPeopleOptions(getDatabase(), sheetTool, projectId)

  // A tool with no record yet starts its writer from what earlier tools hold.
  // D1.12: the critical risks from D1.11's register. D1.14: 4.0 from D1.13's
  // deliverables. D1.15: from D1.13 and D1.14. T3.D1.15a: from the standard
  // deliverables. D1.16: the terms, directives and checklist from the brief
  // and the sheet. D2.1: today, the project's PM, Ghana and GHS. D2.2: the
  // client's legal name and D1.15's figures. D2.3: the sheet's rows, and
  // D1.15's client dependencies on Tier 1. D2.4 and D2.5: the sheet's rows.
  // D2.6: the draft's contract value and duration. D2.10: D2.9's agreed
  // concessions. D2.11: the client contact, the HE and the script. D2.12:
  // the platform D2.11 was signed on. D2.14: D2.12's invoice number and the
  // advance due. D3.1: the sheet's milestones and terms, with D2.1's
  // advance % and currency. D3.4: the cycle's milestone line from D3.1, the
  // billing address and the VAT at D3.1's tax rate. D4.7: D4.6's meeting
  // date.
  if (!view.record && view.can.write) {
    formValues = {
      ...(await startOf(toolId, projectId, session.user, view.cycle)),
      ...formValues,
    }
  }

  // What the system fills, read live: D1.8's author and dates, D1.9 to D1.16's
  // metadata, D1.14's totals and D1.15's 1.0. The PDF shows the same.
  // SAFETY: the system's values are built for the tool's own fields.
  const system = (await systemValuesOf(
    getDatabase(),
    projectId,
    toolId,
    view.record ? { ...view.record, state: toState(view.state) } : null,
    view.can.write ? session.user.name : undefined,
    view.cycle
  )) as FormValues

  formValues = { ...formValues, ...system }

  // Never the fields the system keeps for its own steps, and for the client,
  // none of IMHOGEN's own fields, such as D2.8's hard limits. The server
  // already leaves their values out of what the client reads.
  const asClient = await readsAsClient(
    getDatabase(),
    session.user.id,
    projectId
  )

  // A table the system fills while one answer holds, such as D2.11's
  // signature tracker while the contract is signed in the app, reads as the
  // system's.
  sheetTool = {
    ...sheetTool,
    fields: sheetTool.fields.map((field) =>
      field.type === "table" &&
      field.readOnlyWhen &&
      formValues[field.readOnlyWhen.field] === field.readOnlyWhen.is
        ? { ...field, readOnly: true }
        : field
    ),
  }

  // Nor the fields this project does not ask for, such as D2.10's financial
  // re-check on a contract nobody negotiated.
  sheetTool = withoutFieldsOff(
    toolAsShown(sheetTool, { client: asClient }),
    await fieldsOff(getDatabase(), projectId, toolId, formValues)
  )

  if (asClient) {
    // SAFETY: only keys are taken out, so each value keeps its type.
    formValues = withoutInternalValues(toolId, formValues) as FormValues
  }

  // The [bracketed] names in fixed text the system fills, such as D2.1's
  // client name and total, read live and never stored.
  const fills = await systemFillsOf(
    getDatabase(),
    projectId,
    toolId,
    view.cycle
  )

  // A label the system fills in, such as D3.6's "(Day 1 of [N])".
  sheetTool = {
    ...sheetTool,
    fields: sheetTool.fields.map((field) =>
      field.label.includes("[")
        ? { ...field, label: fillText(field.label, fills) }
        : field
    ),
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

  // Who fills the tool in, named on its empty state for those who only read it.
  const startedBy = roleList(writingRoles(toolId))

  // Why the approver sent the draft back, for the person who writes it.
  const sentBack =
    view.record && view.can.write
      ? await sentBackReason(getDatabase(), {
          id: view.record.id,
          state: "draft",
        })
      : null

  // The team's comments on the record, for anyone on the team who may open
  // the tool. The client, and anyone else, gets none.
  const comments = view.record
    ? await listComments(getDatabase(), session.user.id, view.record.id)
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

  // The writer's button once the record is out of their hands. The server
  // decides who sees it: Withdraw only for whoever submitted it, while it
  // waits for approval; Request a change for a writer once it is locked.
  const writerAction = !view.record ? undefined : view.can.withdraw ? (
    <WithdrawRecord recordId={view.record.id} withdraw={withdrawRecordAction} />
  ) : view.can.requestChange ? (
    <RequestChange
      recordId={view.record.id}
      request={requestChangeAction}
      inSheet
    />
  ) : undefined

  // Fields only the approver fills, such as D4.2's conflict check: the
  // approver whose signature approves answers them while the record is
  // submitted, and nothing else; the writer sees them but cannot change them.
  const reviewed = tool.reviewFields ?? []

  const approving =
    tool.signInTurn && "approves" in tool.signInTurn
      ? tool.signInTurn.approves
      : undefined

  const reviewing =
    reviewed.length > 0 &&
    view.state === "submitted" &&
    view.can.approve &&
    approving !== undefined &&
    view.can.sign.includes(approving)

  const heldBack = reviewing
    ? tool.fields
        .map((field) => field.key)
        .filter((key) => !reviewed.includes(key))
    : reviewed

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
        <ClientRequestTables
          request={clientRequest}
          changedFiles={changedFilesOf(clientChanges, values)}
        />
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
          writerAction={writerAction}
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
      sendBack={sendBackRecordAction}
      sentBack={sentBack ?? undefined}
      writerAction={writerAction}
    />
  ) : alignment ? (
    <MeetingChoice
      recordId={alignment.recordId}
      saved={alignment.saved}
      locked={false}
      open={alignment.open && view.project.status === "active"}
      choose={chooseMeetingTimeAction}
      propose={proposeMeetingTimeAction}
      meetingName="feasibility & engineering alignment meeting"
    />
  ) : notSharedYet ? (
    <EmptyState
      drawing="gear"
      title="Not shared yet"
      description="IMHOGEN shares this with you once it is approved."
    />
  ) : !hasRecord && !view.can.write && !send && !tool.living ? (
    <EmptyState
      drawing="gear"
      title="Not started yet"
      description={startedBy ? `The ${startedBy} starts it.` : undefined}
    />
  ) : (
    <div className="flex flex-col gap-6">
      {deliveryBox}
      <RecordForm
        tool={sheetTool}
        projectId={projectId}
        cycle={view.cycle}
        values={formValues}
        fills={fills}
        recordId={view.record?.id}
        updatedAt={view.record?.updatedAt.toISOString()}
        canWrite={view.can.write || reviewing}
        heldBack={heldBack}
        reviewing={reviewing}
        canApprove={view.can.approve}
        signable={view.can.sign}
        save={saveDraftAction}
        submit={submitRecordAction}
        sign={signFieldAction}
        approve={approveRecordAction}
        send={send}
        sendBack={sendBackRecordAction}
        sentBack={sentBack ?? undefined}
        writerAction={writerAction}
      />
      {meetingActions}
    </div>
  )

  // D1.5 and D1.6 have their own buttons and lock without approval, so
  // Request a change sits under the screen. The wrapper is always there, so
  // the screen keeps what it said when the button appears on lock.
  const sheet =
    agenda || (meeting && !meeting.asClient) ? (
      <div className="flex flex-col gap-6">
        {body}
        {writerAction && <SheetActions>{writerAction}</SheetActions>}
      </div>
    ) : (
      body
    )

  // A milestone's invoice tools, once its payment is reconciled (D3.8).
  const paid =
    [DRAFT_INVOICE, APPROVED_INVOICE, TRANSMITTED_INVOICE].includes(toolId) &&
    (await isCyclePaid(getDatabase(), projectId, view.cycle))

  // D3.5, once approved: the invoice the client receives, to view or save.
  const invoice =
    toolId === APPROVED_INVOICE && view.state === "locked"
      ? await shownInvoice(
          getDatabase(),
          session.user.id,
          projectId,
          view.cycle
        )
      : null

  // D3.9, once sent: the receipt the client received, to view or save.
  const receipt =
    toolId === PAYMENT_RECEIPT && view.state === "locked"
      ? await shownReceipt(
          getDatabase(),
          session.user.id,
          projectId,
          view.cycle
        )
      : null

  // What each PDF preview field shows this person: the PDF, or why not.
  // A tool run once per milestone shows its own cycle's records, such as
  // D3.4's D3.3.
  const previews = await previewStates(
    getDatabase(),
    session.user.id,
    projectId,
    sheetTool,
    view.cycle
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
            topBar={{
              title: `${view.toolId} ${view.toolName}`,
              iteration: view.control?.iteration,
              state: view.state,
              badges: (
                <>
                  {deliveryChip}
                  {view.changeRequested && (
                    <span data-open="true" className="status-chip">
                      Change requested
                    </span>
                  )}
                </>
              ),
              action:
                clientRequest && !webForm ? (
                  <ClientRequestPanel request={clientRequest} />
                ) : undefined,
              exportHref:
                view.record && !notSharedYet
                  ? `/api/records/${view.record.id}/pdf`
                  : undefined,
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
            <CycleList
              toolId={view.toolId}
              href={`/projects/${projectId}/tools/${toolId}`}
              cycles={view.cycles}
              current={view.cycle}
            />
            {paid && <PaidBadge />}
            {invoice && (
              <InvoiceFile
                fileName={invoice.fileName}
                href={invoicePath(projectId, view.cycle)}
                downloadHref={invoicePath(projectId, view.cycle, true)}
              />
            )}
            {receipt && (
              <InvoiceFile
                label="Payment receipt"
                fileName={receipt.fileName}
                href={receiptPath(projectId, view.cycle)}
                downloadHref={receiptPath(projectId, view.cycle, true)}
              />
            )}
            <PdfPreviews states={previews}>{sheet}</PdfPreviews>
            {view.record && comments && (
              <RecordComments
                recordId={view.record.id}
                threads={comments.map((thread) => ({
                  ...shownComment(thread),
                  replies: thread.replies.map(shownComment),
                  resolved: thread.resolvedAt !== null,
                  resolvedByName: thread.resolvedByName,
                }))}
                add={addCommentAction}
                resolve={resolveCommentAction}
              />
            )}
          </ToolSheet>
        </main>
      </div>
    </>
  )
}
