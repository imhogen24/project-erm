import { engineeringRoles, RESOURCE_REQUEST } from "@/lib/resource-request"
import { phaseInvolvements, provisioningStatuses } from "@/lib/team-assignment"
import { yesNo } from "@/lib/technical-notes"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Assignment Metadata"

const routing = "4.0 Approval & Routing"

// The team assignment and provisioning record, the third tool of Workbook 4,
// on Tier 1 only, opened once D4.2 locks. 1.0 is the system's. 2.0 starts on
// one row per D4.2 request row, with its role, days and the engineer the HE
// settled on, and 3.0 on one row per D4.1 3.0 tool (server/team/
// team-assignment). The LE fills it in and submits; the HE signs it, which
// approves and locks it, or sends it back. Locking adds each rostered
// engineer to the project, and the roster is what other projects' D4.2 read
// as that engineer's booked days.
export const d43 = defineTool({
  id: "D4.3",
  name: "Team Assignment & Provisioning",
  workbook: "wb04",
  tier: 1,
  signInTurn: { order: ["heSignature"], approves: "heSignature" },
  submitWhen: [
    {
      field: "engineersLocked",
      is: "Yes",
      message:
        "Answer Yes once every engineer is officially locked in the Master Capacity Tracker (D4 Hub)",
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
      key: "projectManager",
      label: "Project Manager",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "projectName",
      label: "Project Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "referenceRequest",
      label: "Reference Request",
      type: "pdfPreview",
      source: { tool: RESOURCE_REQUEST },
      section: metadata,
    },
    {
      key: "assignmentDate",
      label: "Assignment Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Head of Engineering signs",
      section: metadata,
    },
    {
      key: "roster",
      label: "2.0 Official Project Roster (Locked Team)",
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "role",
          label: "Role / Discipline",
          type: "text",
          required: true,
        },
        {
          key: "engineer",
          label: "Assigned Engineer",
          type: "select",
          options: [],
          optionsFromPeople: { from: "staff", roles: engineeringRoles },
          required: true,
        },
        {
          key: "days",
          label: "Allocated Days",
          type: "number",
          required: true,
        },
        {
          key: "phases",
          label: "Project Phase Involvement",
          type: "select",
          options: phaseInvolvements,
        },
      ],
    },
    {
      key: "provisioning",
      label: "3.0 Hardware & Software Provisioning Ticket",
      type: "table",
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "engineer",
          label: "Assigned Engineer",
          type: "select",
          options: [],
          optionsFromPeople: {
            from: "column",
            field: "roster",
            column: "engineer",
          },
        },
        {
          key: "asset",
          label: "Asset / License Required",
          type: "text",
          required: true,
        },
        {
          key: "dateRequired",
          label: "Date Required",
          type: "date",
        },
        {
          key: "status",
          label: "Provisioning Status (IT/Admin)",
          type: "select",
          options: provisioningStatuses,
        },
      ],
    },
    {
      key: "engineersLocked",
      label:
        "Are all engineers officially locked in the Master Capacity Tracker (D4 Hub)?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "heSignature",
      label: "Head of Engineering Signature",
      type: "signature",
      signedBy: ["HE"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Head of Engineering signs",
      section: routing,
    },
  ],
})
