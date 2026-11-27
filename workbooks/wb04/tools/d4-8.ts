import { YES, yesNo } from "@/lib/kickoff-notes"
import { TEAM_ASSIGNMENT } from "@/lib/team-assignment"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Baseline Metadata"

const schedule = "2.0 Schedule Baseline (Frozen Milestones)"

const resources = "3.0 Resource Baseline (Frozen Labor Hours)"

const authorization = "4.0 Baseline Lock Authorization"

// The locked project baseline, the last tool of Workbook 4, on Tier 1 only,
// opened once D4.7 locks. 2.0 starts on three phases, 2.1 on D4.1's start
// date; each later phase starts the day after the one before ends until the
// HE picks a start of their own, and each row's working days are counted
// from its dates. 3.0 has one row per engineer on D4.3's locked roster, read
// each time it is shown, with their role and days. The HE submits once every
// phase has its dates, none ends before it starts, and 4.0 is Yes, which
// tells the PM; the PM signs, which approves and locks it, or sends it back
// (server/team/locked-baseline).
export const d48 = defineTool({
  id: "D4.8",
  name: "Locked Project Baseline",
  workbook: "wb04",
  tier: 1,
  signInTurn: { order: ["pmSignature"], approves: "pmSignature" },
  submitWhen: [
    {
      field: "matchesContract",
      is: YES,
      message:
        "Answer Yes once the baseline matches the timeline promised in the Contract (D2.12)",
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
      key: "lockedBy",
      label: "Locked By (Project Manager)",
      type: "text",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: metadata,
    },
    {
      key: "dateLocked",
      label: "Date Locked",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: metadata,
    },
    {
      key: "projectClientName",
      label: "Project / Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "totalBudget",
      label: "Total Approved Budget (GHS)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "phases",
      label: schedule,
      type: "table",
      required: true,
      subtotal: "workingDays",
      subtotalLabel: "TOTAL PROJECT DURATION",
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "phase",
          label: "Major Project Phase",
          type: "text",
          required: true,
        },
        {
          key: "startDate",
          label: "Baseline Start Date",
          type: "date",
          required: true,
          followsRowAbove: { column: "endDate", plusDays: 1 },
        },
        {
          key: "endDate",
          label: "Baseline End Date",
          type: "date",
          required: true,
        },
        {
          key: "workingDays",
          label: "Allocated Working Days",
          type: "number",
          systemFilled: true,
          computed: { weekdaysFrom: "startDate", to: "endDate" },
        },
      ],
    },
    {
      key: "resources",
      label: resources,
      type: "table",
      rowsFrom: { tool: TEAM_ASSIGNMENT, field: "roster", keyedBy: "engineer" },
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "engineer",
          label: "Assigned Engineer",
          type: "text",
          systemFilled: true,
        },
        { key: "role", label: "Role", type: "text", systemFilled: true },
        {
          key: "days",
          label: "Total Baseline Hours/Days Allocated",
          type: "text",
          systemFilled: true,
        },
        {
          key: "buffer",
          label: "Cost Impact Buffer",
          type: "text",
          placeholders: ["e.g. Max 2 days overtime", "e.g. None"],
        },
      ],
    },
    {
      key: "matchesContract",
      label:
        "Does this baseline perfectly match the timeline promised in the Contract (D2.12)?",
      type: "select",
      options: yesNo,
      required: true,
      section: authorization,
    },
    {
      key: "pmSignature",
      label: "Head of Operations / Engineering Signature",
      type: "signature",
      signedBy: ["PM"],
      section: authorization,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: authorization,
    },
  ],
})
