import { briefNotice } from "@/lib/project-brief"
import { defineTool } from "@/server/tools/define-tool"

const overview = "1.0 Project & client overview"

const summary = "2.0 Executive summary & core objectives"

const phased = "3.0 Phased deliverables & timeline (abstracted from D1.13 SOW)"

const budget =
  "4.0 Project budget summary (value-based pricing, from D1.14 4.0)"

const exclusions = "5.0 Key exclusions & client responsibilities"

const approval = "6.0 Approval & next steps"

// The Tier 1 brief and draft budget the client reads once the PM approves it.
// The client's details, request ID, title and duration are the system's
// (server/brief); the vision, phases, budget lines and exclusions start from
// D1.13 and D1.14 for the LE to put in the client's words. The budget must
// still add up to D1.14's total project value to be submitted. The LE signs
// and submits; the PM signs and approves, which locks it.
export const d115 = defineTool({
  id: "D1.15",
  name: "Project Brief & Draft Budget",
  workbook: "wb01",
  tier: 1,
  clientReadsOnceLocked: true,
  fields: [
    {
      key: "requestId",
      label: "Reference Request ID",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "clientName",
      label: "Client / Organization Name",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "contactPerson",
      label: "Primary Contact Person",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "contactDetails",
      label: "Contact Email / Phone",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "projectTitle",
      label: "Project Title",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "duration",
      label: "Estimated Project Duration",
      type: "text",
      systemFilled: true,
      section: overview,
    },
    {
      key: "targetStartDate",
      label: "Target Start Date",
      type: "date",
      required: true,
      section: overview,
    },
    {
      key: "vision",
      label: "Project Vision",
      type: "longText",
      required: true,
      section: summary,
    },
    {
      key: "objectives",
      label: "Primary Objectives",
      type: "table",
      required: true,
      section: summary,
      startsWithRow: true,
      columns: [
        {
          key: "objective",
          label: "Objective",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "phases",
      label: "Phased deliverables & timeline",
      type: "table",
      required: true,
      section: phased,
      startsWithRow: true,
      columns: [
        { key: "phaseNo", label: "Phase No.", type: "text", required: true },
        { key: "name", label: "Phase Name", type: "text", required: true },
        {
          key: "deliverables",
          label: "Key Deliverables Included",
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
      key: "budget",
      label: "Project budget summary",
      type: "table",
      required: true,
      section: budget,
      startsWithRow: true,
      subtotal: "value",
      subtotalLabel: "Total Estimated Investment",
      columns: [
        {
          key: "deliverable",
          label: "Project Deliverable / Component",
          type: "text",
          required: true,
        },
        {
          key: "value",
          label: "Allocated Value (GHS)",
          type: "currency",
          required: true,
        },
        {
          key: "paymentSchedule",
          label: "Payment Schedule",
          type: "text",
          required: true,
        },
      ],
    },
    {
      key: "outOfScope",
      label: "Out of Scope (Not Included)",
      type: "longText",
      required: true,
      section: exclusions,
    },
    {
      key: "clientDependencies",
      label: "Client Dependencies",
      type: "longText",
      required: true,
      section: exclusions,
    },
    {
      key: "notice",
      label: "Notice",
      type: "instruction",
      content: briefNotice,
      section: approval,
    },
    {
      key: "headOfRdSignature",
      label: "Head of R&D Signature",
      type: "signature",
      signedBy: ["LE"],
      section: approval,
    },
    {
      key: "approverSignature",
      label: "Signature/Date",
      type: "signature",
      signedBy: ["PM"],
      section: approval,
    },
  ],
})
