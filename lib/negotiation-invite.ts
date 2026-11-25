// D2.8, the negotiation meeting invite: once the client asks for changes to
// the draft contract in D2.7, the Contract Admin plans the meeting, keeps
// IMHOGEN's hard limits in view, and sends the client a calendar invite.

export const NEGOTIATION_INVITE = "D2.8"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// The script's placeholder the app fills from 1.0 when the invite is sent.
// Every other [bracket] must be replaced by the CA before sending.
export const PROPOSED_WHEN = "Proposed Date & Time"

// Meeting times on D2.8 are IMHOGEN's own, Ghana time.
export const MEETING_ZONE = "Africa/Accra"

// The script promises a 30-minute meeting.
export const MEETING_MINUTES = 30

// The sheet's script, as written, with `[Client Name]` and `[Project Name]`
// filled in. The concern and `[Proposed Date & Time]` stay in brackets.
export function inviteScriptFor(clientName: string, projectName: string) {
  return [
    `Dear ${clientName}`,
    `Thank you for reviewing the Draft Engineering Services Agreement for ${projectName}. We appreciate your feedback regarding [Insert 1-2 words on their concern,e.g.,the delivery timeline].`,
    "To ensure we are perfectly aligned and to finalize the terms efficiently, we would like to schedule a brief 30-minute Contract Alignment Meeting with our Lead Project Manager and Engineering Director.",
    `Please let us know if [${PROPOSED_WHEN}] works for your team. Our proposed agenda is as follows:`,
    [
      "1. Review of requested amendments to the Draft Contract.",
      "2. Discussion of operational/timeline impacts.",
      "3. Finalizing terms for the Pending Signature Draft.",
    ].join("\n"),
    "We look forward to a productive discussion.",
    "Best regards",
  ].join("\n\n")
}
