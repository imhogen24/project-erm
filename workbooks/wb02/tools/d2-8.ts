import { BASELINE } from "@/lib/baseline"
import { YES, yesNo } from "@/lib/negotiation-invite"
import { defineTool } from "@/server/tools/define-tool"

const scheduling = "1.0 Meeting scheduling metadata"

const strategy = "2.0 Pre-meeting strategy alignment"

const script = "3.0 Standard meeting invite script (copy & paste to client)"

const verification = "4.0 Calendar verification"

// The negotiation meeting invite, on both tiers, opened when D2.7 locks with
// the client's reply Requested Negotiation. The CA plans the meeting, notes
// what the client wants changed beside IMHOGEN's hard limits, and presses
// Send calendar invite, which emails the client the script with a calendar
// file (server/contract/negotiation-invite). 2.0 is IMHOGEN's own: the client
// never gets it, on screen or in the PDF. Once the invite is sent and every
// 4.0 answer is Yes, the CA submits, which locks D2.8 and opens D2.9. Nobody
// approves it.
export const d28 = defineTool({
  id: "D2.8",
  name: "Negotiation Meeting Invite",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  // The script as it went out stays; 1.0 can change and go as an update.
  freezesOnceSet: { field: "inviteSentAt", fields: ["script"] },
  submitNeeds: [
    {
      field: "inviteSentAt",
      message: "Send the calendar invite to the client first",
    },
  ],
  submitWhen: [
    {
      field: "clientConfirmed",
      is: YES,
      message: "Answer Yes once the client has confirmed the meeting",
    },
    {
      field: "preMeetHeld",
      is: YES,
      message: "Answer Yes once the internal pre-meet has been held",
    },
    {
      field: "readyForMeeting",
      is: YES,
      message: "Answer Yes once you are ready for the meeting (D2.9)",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: scheduling,
    },
    {
      key: "proposedDate",
      label: "Proposed Date",
      type: "date",
      required: true,
      section: scheduling,
    },
    {
      key: "meetingTime",
      label: "Meeting Time (Zone)",
      type: "time",
      required: true,
      section: scheduling,
    },
    {
      key: "platform",
      label: "Platform / Location",
      type: "text",
      required: true,
      placeholder: "e.g. Google Meet / HQ",
      section: scheduling,
    },
    {
      key: "meetingLink",
      label: "Meeting Link / PIN",
      type: "text",
      section: scheduling,
    },
    {
      key: "imhogenReps",
      label: "Required IMHOGEN Reps",
      type: "text",
      placeholder: "e.g. Lead PM & Head of R&D",
      section: scheduling,
    },
    {
      key: "clientReps",
      label: "Client Reps",
      type: "text",
      placeholder: "Type names",
      section: scheduling,
    },
    {
      key: "referenceDocument",
      label: "Reference Document",
      type: "pdfPreview",
      source: { tool: BASELINE },
      internalOnly: true,
      section: strategy,
    },
    {
      key: "clientConcerns",
      label: "Client's Stated Concerns",
      type: "longText",
      placeholder:
        "Briefly summarize what the client wants to change based on their email reply.",
      internalOnly: true,
      section: strategy,
    },
    {
      key: "hardLimits",
      label: "IMHOGEN Hard Limits",
      type: "longText",
      internalOnly: true,
      section: strategy,
    },
    {
      key: "script",
      label: "Standard Meeting Invite Script",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "inviteSent",
      label: "Calendar Invite Sent to Client?",
      type: "select",
      options: yesNo,
      systemFilled: true,
      section: verification,
    },
    {
      key: "clientConfirmed",
      label: "Client Confirmed / RSVP?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    {
      key: "preMeetHeld",
      label: "Internal pre-meet held with negotiators?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    {
      key: "readyForMeeting",
      label: "Ready for Meeting (D2.9)?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    // What the system keeps to send the invite: when it went, which version,
    // what it said, and the date and time filled into the script.
    {
      key: "inviteSentAt",
      label: "Calendar invite sent",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "inviteSequence",
      label: "Invites sent",
      type: "number",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "inviteDigest",
      label: "Invite sent for",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "inviteWhen",
      label: "Proposed date and time sent",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
  ],
})
