import { YES, yesNo } from "@/lib/kickoff-invite"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Meeting Metadata"

const script = "2.0 Standard Invite Script (Internal)"

const verification = "3.0 Scheduling Verification"

// The kick-off calendar invite and agenda, the sixth tool of Workbook 4, on
// Tier 1 only, opened once D4.5 locks. The PM sets the meeting's date, time
// and place and checks the script, which starts on the sheet's message with
// the project named. Send invite emails D4.3's rostered engineers and the PM
// the script with a calendar file (server/team/kickoff-invite); sending
// again after a change updates the same meeting. Once the invite has gone
// and the room or platform is booked, the PM submits, which locks it: there
// is no approver.
export const d46 = defineTool({
  id: "D4.6",
  name: "Kick-off Calendar Invite & Agenda",
  workbook: "wb04",
  tier: 1,
  locksOnSubmit: true,
  submitNeeds: [
    {
      field: "inviteSentAt",
      message: "Send the invite to the rostered engineers first",
    },
  ],
  submitWhen: [
    {
      field: "roomBooked",
      is: YES,
      message: "Answer Yes once the room or platform is booked",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "meetingDate",
      label: "Meeting Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "meetingTime",
      label: "Time",
      type: "time",
      required: true,
      section: metadata,
    },
    {
      key: "location",
      label: "Location / Link",
      type: "text",
      required: true,
      placeholder: "HQ / Google Meet",
      section: metadata,
    },
    {
      key: "leadFacilitator",
      label: "Lead Facilitator",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "attendees",
      label: "Required Attendees",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "script",
      label: "Standard Invite Script (Internal)",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "inviteSent",
      label: "Calendar Invite sent to all rostered engineers?",
      type: "select",
      options: yesNo,
      systemFilled: true,
      section: verification,
    },
    {
      key: "roomBooked",
      label: "Room/Platform booked?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    // What the system keeps to send the invite: when it went, which version
    // and what it said.
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
  ],
})
