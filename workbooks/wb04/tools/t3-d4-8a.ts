import { digitalAssets, technicalBaseline } from "@/lib/drafting-assignment"
import { engineeringRoles } from "@/lib/resource-request"
import { defineTool } from "@/server/tools/define-tool"

const assignment = "1.0 Engineer Assignment (Replaces D4.2 & D4.3)"

const bypass = "4.0 Kick-off Bypass Acknowledgment (Replaces D4.5, D4.6, D4.7)"

const authorization = "5.0 Final Authorization"

// Every status 2.0 offers; each row offers its own two (rowOptions).
const statuses = [
  ...new Set(digitalAssets.flatMap((asset) => [...asset.statuses])),
]

// The drafting assignment and baseline, Workbook 4's only tool on Tier 3, in
// place of D4.1 to D4.8, opened with the workbook. 1.1 starts on the AE
// writing it, and 3.0's requirements on T3.D1.3a's drafting specifications
// (server/team/drafting-assignment). Each target delivery date follows its
// start date plus T3.D1.15a's longest delivery timeline. The AE fills it in,
// signs and submits; the PM signs it, which approves and locks it, or sends
// it back. Locking adds each engineer in 1.0 to the project, as D4.3 does.
// The sheet is the source: docs/dev_docs/WORKBOOK_04, T3.D4.8a.
export const t3d48a = defineTool({
  id: "T3.D4.8a",
  name: "Drafting Assignment & Baseline",
  workbook: "wb04",
  tier: 3,
  replaces: "D4.8",
  signInTurn: { order: ["pmSignature"], approves: "pmSignature" },
  submitNeeds: [
    {
      field: "aeSignature",
      message: "Sign as the Assigned Engineer before submitting",
    },
  ],
  submitWhen: digitalAssets.map((asset, row) => ({
    field: "digitalAccess",
    column: "status",
    row,
    is: asset.statuses[0],
    message: `${asset.resource} must read ${asset.statuses[0]} before submitting`,
  })),
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "assignmentNote",
      label: "Direct assignment",
      type: "instruction",
      content:
        "The following engineer is directly assigned to this drafting request. No formal capacity review required if under 5 days.",
      section: assignment,
    },
    {
      key: "deliveryTimeline",
      label: "Delivery Timeline (T3.D1.15a)",
      type: "text",
      systemFilled: true,
      section: assignment,
    },
    {
      key: "roster",
      label: assignment,
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "1" },
        {
          key: "engineer",
          label: "Assigned Engineer",
          type: "select",
          options: [],
          optionsFromPeople: { from: "staff", roles: engineeringRoles },
          required: true,
        },
        {
          key: "skillset",
          label: "Primary Skillset",
          type: "text",
          placeholders: ["e.g. 3D Modeling/Surfacing"],
        },
        {
          key: "allocatedHours",
          label: "Allocated Hours",
          type: "text",
          placeholders: ["e.g. 16 Hrs"],
        },
        {
          key: "startDate",
          label: "Start Date",
          type: "date",
          required: true,
        },
        {
          key: "targetDate",
          label: "Target Delivery Date",
          type: "date",
          required: true,
          followsInRow: {
            column: "startDate",
            plusDurationOf: "deliveryTimeline",
          },
        },
      ],
    },
    {
      key: "digitalAccess",
      label: "2.0 Digital Access & Assets (Replaces D4.4)",
      type: "table",
      required: true,
      fixedRows: digitalAssets.map((asset) => ({ resource: asset.resource })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        { key: "resource", label: "Resource Required", type: "text" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: statuses,
          rowOptions: digitalAssets.map((asset) => [...asset.statuses]),
          required: true,
        },
        {
          key: "link",
          label: "Direct Link / Asset ID",
          type: "text",
          rowPreviews: ["D1.1"],
          placeholders: ["", "", "e.g. Autodesk Inventor"],
        },
        { key: "notes", label: "Notes", type: "text" },
      ],
    },
    {
      key: "technicalBaseline",
      label: "3.0 Technical Baseline & Standards (Replaces D4.1 & D4.8)",
      type: "table",
      fixedRows: technicalBaseline.map((row) => ({
        parameter: row.parameter,
        reference: row.reference,
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        { key: "parameter", label: "Parameter", type: "text" },
        { key: "requirement", label: "Requirement", type: "text" },
        { key: "reference", label: "Reference Standard", type: "text" },
        { key: "notes", label: "Notes", type: "text" },
      ],
    },
    {
      key: "bypassNote",
      label: "Kick-off bypass",
      type: "instruction",
      content:
        "By signing below, the Lead Engineer confirms they have reviewed the T3.D1.3a Technical Intake and require no further internal briefing.",
      section: bypass,
    },
    {
      key: "pmSignature",
      label: "Project Manager Signature",
      type: "signature",
      signedBy: ["PM"],
      section: authorization,
    },
    {
      key: "pmSignedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: authorization,
    },
    {
      key: "aeSignature",
      label: "Assigned Engineer Signature",
      type: "signature",
      signedBy: ["AE"],
      section: authorization,
    },
    {
      key: "aeSignedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Assigned Engineer signs",
      section: authorization,
    },
  ],
})
