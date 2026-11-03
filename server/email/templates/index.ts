import { approvalNeeded, type ApprovalNeededData } from "./approval-needed"
import { assigned, type AssignedData } from "./assigned"
import type { RenderedEmail } from "./html"
import { newRequest, type NewRequestData } from "./new-request"

export type { RenderedEmail } from "./html"

// A later issue that sends another kind adds its data here and its template
// below.
export type EmailDataByKind = {
  new_request: NewRequestData
  assigned: AssignedData
  approval_needed: ApprovalNeededData
}

export type EmailKind = keyof EmailDataByKind

type Template<K extends EmailKind> = (data: EmailDataByKind[K]) => RenderedEmail

// Every kind has exactly one template.
type Templates = { [K in EmailKind]: Template<K> }

const templates: Templates = {
  new_request: newRequest,
  assigned,
  approval_needed: approvalNeeded,
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
