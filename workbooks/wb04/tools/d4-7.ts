import { YES, yesNo } from "@/lib/kickoff-notes"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import { defineTool, type PeopleSource } from "@/server/tools/define-tool"

const metadata = "1.0 Meeting Execution Metadata"

const attendance = "2.0 Attendance & Verification"

const resolutions = "3.0 Technical Resolutions & Risks Identified"

const dayOne = "4.0 Day 1 Immediate Action Items (Unblocking the Team)"

const routing = "5.0 Routing"

// The engineers on D4.3's locked roster, then the project's PM.
const team: PeopleSource = {
  from: "roster",
  tool: TEAM_ASSIGNMENT,
  field: "roster",
  column: "engineer",
  roles: ["PM"],
}

// The kick-off meeting minutes, the seventh tool of Workbook 4, on Tier 1
// only, opened once D4.6 locks. Actual Meeting Date starts on D4.6's date.
// 2.0 has one row per engineer on D4.3's locked roster, read from it each
// time it is shown, with their name and role; the LE answers each and may
// add other attendees after them. The LE submits once every attendee is
// answered and 5.0 is Yes, which tells the PM; the PM signs, which approves
// and locks it, or sends it back (server/team/kickoff-notes).
export const d47 = defineTool({
  id: "D4.7",
  name: "Kick-off Meeting Minutes",
  workbook: "wb04",
  tier: 1,
  signInTurn: { order: ["pmSignature"], approves: "pmSignature" },
  submitWhen: [
    {
      field: "teamClear",
      is: YES,
      message:
        "Answer Yes once every team member is clear on their Phase 1 objectives",
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
      key: "actualDate",
      label: "Actual Meeting Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "startEndTime",
      label: "Start / End Time",
      type: "text",
      placeholder: "00:00 to 00:00",
      section: metadata,
    },
    {
      key: "leadFacilitator",
      label: "Lead Facilitator (PM)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "noteTaker",
      label: "Note Taker",
      type: "select",
      options: [],
      optionsFromPeople: team,
      section: metadata,
    },
    {
      key: "attendance",
      label: attendance,
      type: "table",
      rowsFrom: {
        tool: TEAM_ASSIGNMENT,
        field: "roster",
        keyedBy: "sn",
        addRows: true,
      },
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "attendee",
          label: "Required Attendee (From D4.3)",
          type: "text",
          systemFilled: true,
        },
        { key: "role", label: "Role", type: "text", systemFilled: true },
        {
          key: "present",
          label: "Present? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        { key: "notes", label: "Notes (If absent)", type: "text" },
      ],
    },
    {
      key: "resolutions",
      label: resolutions,
      type: "table",
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "topic",
          label: "Topic Discussed",
          type: "text",
          placeholders: [
            "e.g. Prototype Material",
            "e.g. Timeline Constraints",
          ],
        },
        {
          key: "raisedBy",
          label: "Engineer Raising Point",
          type: "select",
          options: [],
          optionsFromPeople: team,
        },
        {
          key: "decision",
          label: "Decision / Resolution Agreed",
          type: "longText",
          placeholders: [
            "e.g. Standard PLA will melt. Must use ABS.",
            "e.g. PCB fabrication takes 14 days minimum.",
          ],
        },
        {
          key: "action",
          label: "Action Required",
          type: "text",
          placeholders: ["Update BOM", "Order PCBs on Day 1"],
        },
      ],
    },
    {
      key: "dayOneActions",
      label: dayOne,
      type: "table",
      startsWithRow: true,
      columns: [
        {
          key: "task",
          label: "Task Description",
          type: "text",
          placeholders: [
            "e.g. PM to formally order ABS filament and PCBs",
            "e.g. Lead Engineer to set up Master CAD Assembly file",
          ],
        },
        {
          key: "assignedTo",
          label: "Assigned To",
          type: "select",
          options: [],
          optionsFromPeople: team,
        },
        { key: "deadline", label: "Deadline", type: "date" },
      ],
    },
    {
      key: "teamClear",
      label: "Are all team members fully clear on their Phase 1 objectives?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "pmSignature",
      label: "Project Manager Signature",
      type: "signature",
      signedBy: ["PM"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: routing,
    },
  ],
})
