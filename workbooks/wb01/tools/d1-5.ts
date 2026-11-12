import { meetingPlatforms } from "@/lib/meeting-proposal"
import { meetingZones } from "@/lib/meeting-time"
import { defineTool } from "@/server/tools/define-tool"

const slots = "1.0 Proposed meeting times"

const email = "3.0 Standard scheduling email"

const confirmation = "4.0 Final meeting confirmation"

const zones = meetingZones.map((zone) => zone.id)

const slotColumns = [
  { key: "date", label: "Date", type: "date", required: true },
  { key: "time", label: "Time", type: "time", required: true },
  {
    key: "timeZone",
    label: "Time zone",
    type: "select",
    options: zones,
    required: true,
  },
] as const

// The meeting time proposal. The OM proposes slots and sends them; the client
// chooses one on their dashboard, or proposes another time; the OM then fills
// in the platform and link and confirms, which locks D1.5. Nobody approves
// it. Everything the client did is held in system-filled fields, which a save
// from the form never changes (server/meetings). Tier 1 only: Tier 3 skips the
// meeting. The sheet is the source: docs/dev_docs/WORKBOOK_01, D1.5.
export const d15 = defineTool({
  id: "D1.5",
  name: "Meeting Time Proposal",
  workbook: "wb01",
  tier: 1,
  autosave: true,
  fields: [
    {
      key: "slots",
      label: "Proposed meeting times",
      type: "table",
      section: slots,
      startsWithRow: true,
      columns: [...slotColumns],
    },
    // What the client was sent, kept as it was, so a later edit by the OM
    // does not change what the client chooses from until it is sent again.
    {
      key: "offeredSlots",
      label: "Times sent to the client",
      type: "table",
      section: slots,
      readOnly: true,
      columns: [...slotColumns],
    },
    {
      key: "sentToClientAt",
      label: "Sent to the client",
      type: "text",
      systemFilled: true,
      section: slots,
    },
    {
      key: "chosenSlot",
      label: "Chosen slot",
      type: "number",
      systemFilled: true,
      section: slots,
    },
    {
      key: "clientComment",
      label: "Client comments",
      type: "longText",
      systemFilled: true,
      section: slots,
    },
    {
      key: "proposedDate",
      label: "Date the client proposed",
      type: "date",
      systemFilled: true,
      section: slots,
    },
    {
      key: "proposedTime",
      label: "Time the client proposed",
      type: "time",
      systemFilled: true,
      section: slots,
    },
    {
      key: "proposedTimeZone",
      label: "Time zone the client proposed in",
      type: "text",
      systemFilled: true,
      section: slots,
    },
    {
      key: "emailText",
      label: "Scheduling email",
      type: "longText",
      systemFilled: true,
      systemNote: "Filled in when the times are sent",
      section: email,
    },
    {
      key: "agreedDate",
      label: "Agreed Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the client chooses a time",
      section: confirmation,
    },
    {
      key: "agreedTime",
      label: "Agreed Time",
      type: "time",
      systemFilled: true,
      systemNote: "Filled in when the client chooses a time",
      section: confirmation,
    },
    {
      key: "agreedTimeZone",
      label: "Agreed time zone",
      type: "text",
      systemFilled: true,
      section: confirmation,
    },
    {
      key: "platform",
      label: "Meeting Platform/Location",
      type: "select",
      options: [...meetingPlatforms],
      section: confirmation,
    },
    {
      key: "meetingLink",
      label: "Direct Meeting Link",
      type: "text",
      section: confirmation,
    },
    {
      key: "calendarInviteSent",
      label: "Calendar Invite Sent?",
      type: "boolean",
      section: confirmation,
    },
    {
      key: "clientConfirmed",
      label: "Client Confirmed?",
      type: "boolean",
      systemFilled: true,
      section: confirmation,
    },
    { key: "note", label: "Note", type: "longText", section: confirmation },
  ],
})
