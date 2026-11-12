import { checkStatuses, preMeetingChecks } from "@/lib/calendar-agenda"
import { defineTool } from "@/server/tools/define-tool"

const details = "1.0 Finalized meeting details"

const calendar = "2.0 Calendar integration"

const checklist = "4.0 Pre-meeting checklist"

const notes = "Notes"

// The calendar invite and agenda for the discovery meeting. The meeting's
// date, time, platform and link come from the confirmed D1.5. The OM chooses
// who attends from IMHOGEN, sets the agenda (the sheet's five topics to start
// from), sends the calendar invite from the ERM, and works through the
// pre-meeting checks; Ready for the meeting locks D1.6. Nobody approves it,
// and the client only reads it (server/meetings). Tier 1 only. The sheet is
// the source: docs/dev_docs/WORKBOOK_01, D1.6.
export const d16 = defineTool({
  id: "D1.6",
  name: "Calendar Invite & Agenda",
  workbook: "wb01",
  tier: 1,
  autosave: true,
  fields: [
    {
      key: "meetingDate",
      label: "Meeting Date",
      type: "date",
      inherited: { tool: "D1.5", field: "agreedDate" },
      section: details,
    },
    {
      key: "meetingTime",
      label: "Meeting Time",
      type: "time",
      inherited: { tool: "D1.5", field: "agreedTime" },
      section: details,
    },
    {
      key: "meetingTimeZone",
      label: "Time zone",
      type: "text",
      inherited: { tool: "D1.5", field: "agreedTimeZone" },
      section: details,
    },
    {
      key: "platform",
      label: "Platform/Location",
      type: "text",
      inherited: { tool: "D1.5", field: "platform" },
      section: details,
    },
    {
      key: "meetingLink",
      label: "Meeting ID/PIN",
      type: "text",
      inherited: { tool: "D1.5", field: "meetingLink" },
      section: details,
    },
    {
      key: "imhogenAttendees",
      label: "IMHOGEN Attendees",
      type: "table",
      section: details,
      columns: [
        { key: "personId", label: "Person", type: "text", required: true },
        { key: "name", label: "Name", type: "text" },
        { key: "role", label: "Role", type: "text" },
      ],
    },
    {
      key: "clientAttendees",
      label: "Client Attendees",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when the invite is sent",
      section: details,
    },
    {
      key: "agenda",
      label: "Agenda",
      type: "table",
      section: calendar,
      startsWithRow: true,
      columns: [
        {
          key: "minutes",
          label: "Time Allotted (mins)",
          type: "number",
          required: true,
        },
        { key: "topic", label: "Agenda Topic", type: "text", required: true },
        { key: "leadSpeaker", label: "Lead Speaker", type: "text" },
        {
          key: "objective",
          label: "Meeting Objective / Focus",
          type: "longText",
        },
      ],
    },
    {
      key: "inviteSentAt",
      label: "Calendar invite sent",
      type: "text",
      systemFilled: true,
      section: calendar,
    },
    {
      key: "inviteSequence",
      label: "Invites sent",
      type: "number",
      systemFilled: true,
      section: calendar,
    },
    {
      key: "inviteDigest",
      label: "Invite sent for",
      type: "text",
      systemFilled: true,
      section: calendar,
    },
    {
      key: "preMeetingChecks",
      label: "Pre-meeting checklist",
      type: "table",
      section: checklist,
      prefilledRows: preMeetingChecks.map((each) => each.task),
      columns: [
        { key: "task", label: "Task", type: "text" },
        { key: "assignee", label: "Assignee", type: "text" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [...checkStatuses],
        },
      ],
    },
    { key: "notes", label: "Notes", type: "longText", section: notes },
  ],
})
