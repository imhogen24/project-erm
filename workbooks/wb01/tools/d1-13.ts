import { meetingPlatforms } from "@/lib/meeting-proposal"
import { meetingZones } from "@/lib/meeting-time"
import { defineTool } from "@/server/tools/define-tool"

const overview = "1.0 SOW metadata & overview"

const included = "2.0 Included scope (specific deliverables)"

const excluded = "3.0 Excluded scope (out of scope)"

const phases = "4.0 Phased timeline & milestones"

const responsibilities = "5.0 Client responsibilities & dependencies"

const meeting = "6.0 Client feasibility & engineering alignment meeting"

const routing = "7.0 SOW routing"

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

// The draft scope of work, on both tiers, with the meeting where it is put to
// the client. The Lead Engineer writes the scope, books the meeting the way
// D1.5 does (times sent, the client chooses on their dashboard), sends the
// calendar invite, updates the scope after the meeting, signs and submits;
// the PM approves, which locks the scope and opens D1.14. The meeting fields
// share D1.5's names, so the same code books both (server/meetings). What
// the system holds is filled in by server/scope. The client reads the scope
// once approved.
export const d113 = defineTool({
  id: "D1.13",
  name: "Draft Scope of Work",
  workbook: "wb01",
  clientReadsOnceLocked: true,
  submitNeeds: [
    {
      field: "inviteSentAt",
      message: "Send the meeting's calendar invite first",
    },
  ],
  fields: [
    {
      key: "draftedBy",
      label: "Drafted By (Lead Engineer/PM)",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "clientName",
      label: "Client Name",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "assessmentDate",
      label: "Date of Assessment",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "projectTitle",
      label: "Project",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "draftDate",
      label: "Date of Draft",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when signed",
      section: overview,
    },
    {
      key: "sowStatus",
      label: "SOW Status",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "requestId",
      label: "Reference Request ID",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "duration",
      label: "Preliminary Project Duration",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "vision",
      label: "Project Vision / Primary Goal",
      type: "longText",
      required: true,
      section: overview,
    },
    {
      key: "includedScope",
      label: "Included scope",
      type: "table",
      required: true,
      section: included,
      startsWithRow: true,
      columns: [
        {
          key: "category",
          label: "Deliverable Category",
          type: "text",
          required: true,
        },
        {
          key: "description",
          label: "Detailed Description of Deliverable",
          type: "longText",
          required: true,
        },
        { key: "format", label: "Format / Quantity", type: "text" },
        { key: "phase", label: "Delivery Phase", type: "text" },
      ],
    },
    {
      key: "excludedScope",
      label: "Excluded scope",
      type: "table",
      section: excluded,
      columns: [
        {
          key: "category",
          label: "Exclusion Category",
          type: "text",
          required: true,
        },
        {
          key: "description",
          label: "Description of Excluded Work",
          type: "longText",
          required: true,
        },
        { key: "reasoning", label: "Reasoning (Optional)", type: "longText" },
      ],
    },
    {
      key: "phases",
      label: "Phased timeline & milestones",
      type: "table",
      required: true,
      section: phases,
      startsWithRow: true,
      columns: [
        { key: "name", label: "Phase Name", type: "text", required: true },
        {
          key: "activities",
          label: "Key Activities / Milestones",
          type: "longText",
          required: true,
        },
        {
          key: "duration",
          label: "Estimated Duration",
          type: "text",
          required: true,
        },
        { key: "target", label: "Target Completion", type: "text" },
      ],
    },
    {
      key: "clientResponsibilities",
      label: "Client responsibilities & dependencies",
      type: "table",
      section: responsibilities,
      columns: [
        {
          key: "requirement",
          label: "Requirement",
          type: "text",
          required: true,
        },
        {
          key: "description",
          label: "Description",
          type: "longText",
          required: true,
        },
        { key: "due", label: "Due Date", type: "text" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["Pending", "Done"],
        },
      ],
    },
    {
      key: "slots",
      label: "Proposed meeting times",
      type: "table",
      section: meeting,
      startsWithRow: true,
      columns: [...slotColumns],
    },
    {
      key: "offeredSlots",
      label: "Times sent to the client",
      type: "table",
      section: meeting,
      readOnly: true,
      columns: [...slotColumns],
    },
    {
      key: "sentToClientAt",
      label: "Sent to the client",
      type: "text",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "chosenSlot",
      label: "Chosen slot",
      type: "number",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "clientComment",
      label: "Client comments",
      type: "longText",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "proposedDate",
      label: "Date the client proposed",
      type: "date",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "proposedTime",
      label: "Time the client proposed",
      type: "time",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "proposedTimeZone",
      label: "Time zone the client proposed in",
      type: "text",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "emailText",
      label: "Scheduling email",
      type: "longText",
      systemFilled: true,
      systemNote: "Filled in when the times are sent",
      section: meeting,
    },
    {
      key: "agreedDate",
      label: "Agreed Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the client chooses a time",
      section: meeting,
    },
    {
      key: "agreedTime",
      label: "Agreed Time",
      type: "time",
      systemFilled: true,
      systemNote: "Filled in when the client chooses a time",
      section: meeting,
    },
    {
      key: "agreedTimeZone",
      label: "Agreed time zone",
      type: "text",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "clientConfirmed",
      label: "Client Confirmed?",
      type: "boolean",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "platform",
      label: "Meeting Platform/Location",
      type: "select",
      options: [...meetingPlatforms],
      section: meeting,
    },
    {
      key: "meetingLink",
      label: "Direct Meeting Link",
      type: "text",
      section: meeting,
    },
    {
      key: "inviteSentAt",
      label: "Calendar invite sent",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when the invite is sent",
      section: meeting,
    },
    {
      key: "inviteSequence",
      label: "Invites sent",
      type: "number",
      systemFilled: true,
      section: meeting,
    },
    {
      key: "scopeLocked",
      label: "Scope Locked?",
      type: "text",
      systemFilled: true,
      section: routing,
    },
    {
      key: "signature",
      label: "PM / Lead Engineer Signature",
      type: "signature",
      signedBy: ["LE"],
      section: routing,
    },
    {
      key: "readyForCosting",
      label: "Ready for Cost Estimation (D1.14)?",
      type: "text",
      systemFilled: true,
      section: routing,
    },
  ],
})
