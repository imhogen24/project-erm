import { acknowledgement, type AcknowledgementData } from "./acknowledgement"
import { approvalNeeded, type ApprovalNeededData } from "./approval-needed"
import { assigned, type AssignedData } from "./assigned"
import {
  bankCheckReminder,
  type BankCheckReminderData,
} from "./bank-check-reminder"
import { calendarInvite, type CalendarInviteData } from "./calendar-invite"
import {
  contractTransmittal,
  type ContractTransmittalData,
} from "./contract-transmittal"
import { followUpSent, type FollowUpSentData } from "./follow-up-sent"
import { invoiceReminder, type InvoiceReminderData } from "./invoice-reminder"
import type { RenderedEmail } from "./html"
import { meetingTimes, type MeetingTimesData } from "./meeting-times"
import { newRequest, type NewRequestData } from "./new-request"
import { paymentOverdue, type PaymentOverdueData } from "./payment-overdue"
import { sentBack, type SentBackData } from "./sent-back"
import { lockAnnounced, type LockAnnouncedData } from "./lock-announced"
import {
  signatureOverdue,
  type SignatureOverdueData,
} from "./signature-overdue"
import {
  signatureReminder,
  type SignatureReminderData,
} from "./signature-reminder"
import { signatureNeeded, type SignatureNeededData } from "./signature-needed"
import {
  transmittalFollowUp,
  type TransmittalFollowUpData,
} from "./transmittal-follow-up"
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
  contract_transmittal: ContractTransmittalData
  transmittal_follow_up: TransmittalFollowUpData
  // D3.6's invoice to the client: the same shape as D2.7's contract email.
  invoice_transmittal: ContractTransmittalData
  // D3.9's receipt to the client: the same shape again.
  receipt_transmittal: ContractTransmittalData
  invoice_reminder: InvoiceReminderData
  bank_check_reminder: BankCheckReminderData
  payment_overdue: PaymentOverdueData
  follow_up_sent: FollowUpSentData
  sent_back: SentBackData
  lock_announced: LockAnnouncedData
  signature_needed: SignatureNeededData
  signature_reminder: SignatureReminderData
  signature_overdue: SignatureOverdueData
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
  contract_transmittal: contractTransmittal,
  transmittal_follow_up: transmittalFollowUp,
  invoice_transmittal: contractTransmittal,
  receipt_transmittal: contractTransmittal,
  invoice_reminder: invoiceReminder,
  bank_check_reminder: bankCheckReminder,
  payment_overdue: paymentOverdue,
  follow_up_sent: followUpSent,
  sent_back: sentBack,
  lock_announced: lockAnnounced,
  signature_needed: signatureNeeded,
  signature_reminder: signatureReminder,
  signature_overdue: signatureOverdue,
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
