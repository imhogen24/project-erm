import { acknowledgement, type AcknowledgementData } from "./acknowledgement"
import { approvalNeeded, type ApprovalNeededData } from "./approval-needed"
import { assigned, type AssignedData } from "./assigned"
import { calendarInvite, type CalendarInviteData } from "./calendar-invite"
import type { RenderedEmail } from "./html"
import { meetingTimes, type MeetingTimesData } from "./meeting-times"
import { newRequest, type NewRequestData } from "./new-request"
import { verifyEmail, type VerifyEmailData } from "./verify-email"

export type { RenderedEmail } from "./html"

// A later issue that sends another kind adds its data here and its template
// below.
export type EmailDataByKind = {
  new_request: NewRequestData
  assigned: AssignedData
  approval_needed: ApprovalNeededData
  acknowledgement: AcknowledgementData
  verify_email: VerifyEmailData
  meeting_times: MeetingTimesData
  calendar_invite: CalendarInviteData
}

export type EmailKind = keyof EmailDataByKind

type Template<K extends EmailKind> = (data: EmailDataByKind[K]) => RenderedEmail

// Every kind has exactly one template.
type Templates = { [K in EmailKind]: Template<K> }

const templates: Templates = {
  new_request: newRequest,
  assigned,
  approval_needed: approvalNeeded,
  acknowledgement,
  verify_email: verifyEmail,
  meeting_times: meetingTimes,
  calendar_invite: calendarInvite,
}

// SAFETY: templates is an object literal typed Templates, so its keys are
// exactly the email kinds and nothing else.
export const emailKinds = Object.keys(templates) as EmailKind[]

export function renderEmail<K extends EmailKind>(
  kind: K,
  data: EmailDataByKind[K]
): RenderedEmail {
  return templates[kind](data)
}
