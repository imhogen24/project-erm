import { ANY_AVAILABLE, engineeringRoles } from "@/lib/resource-request"
import { yesNo } from "@/lib/technical-notes"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Request Metadata"

const routing = "4.0 Approval & Routing"

const engineers = { from: "staff", roles: engineeringRoles } as const

// The resource request form, the second tool of Workbook 4, on Tier 1 only,
// opened once D4.1 locks. 1.0 is the system's. 2.0 starts on one row per
// D4.1 skill row, with its role and days (server/team/resource-request). The
// LE fills it in and submits. 3.0 has one row per 2.0 row, with the engineer
// asked for and their days on other projects; the HE answers it and 4.0
// (`reviewFields`), which the LE cannot change, and signs, which approves
// and locks it, or sends it back.
export const d42 = defineTool({
  id: "D4.2",
  name: "Resource Request Form",
  workbook: "wb04",
  tier: 1,
  signInTurn: { order: ["heSignature"], approves: "heSignature" },
  reviewFields: ["conflictCheck", "rolesApproved"],
  reviewWhen: [
    {
      field: "rolesApproved",
      is: "Yes",
      message:
        "Answer Yes once every requested role is filled and approved by Engineering Leadership",
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
      key: "requestingPm",
      label: "Requesting PM",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "requestDate",
      label: "Date of Request",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when D4.2 is submitted",
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
      key: "totalBudgetedLabor",
      label: "Total Budgeted Labor (GHS)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "resourceRequests",
      label: "2.0 Human Resource Request",
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "role",
          label: "Role Required",
          type: "text",
          required: true,
        },
        {
          key: "preferredEngineer",
          label: "Preferred Engineer (Optional)",
          type: "select",
          options: [ANY_AVAILABLE],
          optionsFromPeople: engineers,
        },
        {
          key: "dates",
          label: "Dates Needed (Start to End)",
          type: "text",
          required: true,
          placeholders: ["DD/MM to DD/MM"],
        },
        {
          key: "days",
          label: "Total Days Requested",
          type: "number",
          required: true,
        },
      ],
    },
    {
      key: "conflictCheck",
      label:
        "3.0 Conflict & Overlap Check (To be filled by Head of Engineering)",
      type: "table",
      required: true,
      rowsFrom: { field: "resourceRequests", keyedBy: "sn" },
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "requestedEngineer",
          label: "Requested Engineer",
          type: "text",
          systemFilled: true,
        },
        {
          key: "utilization",
          label: "Current Utilization Status",
          type: "text",
          systemFilled: true,
        },
        {
          key: "approved",
          label: "Approved for this Project? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        {
          key: "alternative",
          label: "Alternative Assignment",
          type: "select",
          options: [],
          optionsFromPeople: engineers,
          requiredWhen: {
            column: "approved",
            is: "No",
            message: "Name an alternative engineer for a No",
          },
        },
      ],
    },
    {
      key: "rolesApproved",
      label:
        "Are all requested roles filled and approved by Engineering Leadership?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "heSignature",
      label: "Head of Engineering / R&D Signature",
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
