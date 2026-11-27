import {
  resourceCategories,
  resourceStatuses,
  yesNo,
} from "@/lib/technical-notes"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Breakdown Metadata"

const skills = "2.0 Skill & Labor Requirements"

const resources = "3.0 Software & Equipment Requirements"

const routing = "4.0 Routing & Approval"

// The technical requirement notes, the first tool of Workbook 4, on Tier 1
// only, opened with the workbook once D3.10 locks. 1.0 is the system's but
// for the Target Project Start Date, which starts on D2.14's start date. 2.0
// starts on one row per D1.14 Engineering Module with its Estimated Days,
// and 3.0 on the sheet's three resource categories (server/team/
// technical-notes). The LE fills it in and submits; the PM signs it, which
// approves and locks it, or sends it back.
export const d41 = defineTool({
  id: "D4.1",
  name: "Technical Requirement Notes",
  workbook: "wb04",
  tier: 1,
  signInTurn: { order: ["pmSignature"], approves: "pmSignature" },
  submitWhen: [
    {
      field: "readyForRequest",
      is: "Yes",
      message:
        "Answer Yes once the technical breakdown is complete and ready for the Resource Request (D4.2)",
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
      key: "breakdownDate",
      label: "Date of Breakdown",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when D4.1 is submitted",
      section: metadata,
    },
    {
      key: "targetStartDate",
      label: "Target Project Start Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "referenceContract",
      label: "Reference Contract",
      type: "pdfPreview",
      source: { tool: "D2.12" },
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
      key: "skills",
      label: skills,
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "module",
          label: "Engineering Module (From Pricing Matrix)",
          type: "text",
          required: true,
        },
        {
          key: "role",
          label: "Required Role / Skill Level",
          type: "text",
          required: true,
          placeholders: [
            "e.g. Mid-Level CAD Engineer",
            "e.g. Senior Thermal Engineer",
            "e.g. Junior Technician",
          ],
        },
        {
          key: "days",
          label: "Estimated Effort (Days)",
          type: "number",
          required: true,
        },
        {
          key: "notes",
          label: "Specific Constraints / Notes",
          type: "longText",
          placeholders: [
            "e.g. Must be prolific in Autodesk Inventor",
            "e.g. Requires background in consumer appliance heating",
            "e.g. 3D printing and basic soldering skills needed",
          ],
        },
      ],
    },
    {
      key: "resources",
      label: resources,
      type: "table",
      required: true,
      fixedRows: resourceCategories.map((category) => ({ category })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "category",
          label: "Resource Category",
          type: "text",
          required: true,
        },
        {
          key: "tool",
          label: "Specific Tool / Machine Needed",
          type: "text",
          required: true,
          placeholders: [
            "e.g. Autodesk Inventor 2025",
            "e.g. 3D Printer (High Temp Resin)",
            "e.g. Digital Anemometer / Thermal Camera",
          ],
        },
        {
          key: "duration",
          label: "Duration Required",
          type: "text",
          required: true,
          placeholders: ["e.g. 15 Days", "e.g. 3 Days", "e.g. 2 Days"],
        },
        {
          key: "status",
          label: "Status (Available/Needs Procurement)",
          type: "select",
          options: resourceStatuses,
          required: true,
        },
      ],
    },
    {
      key: "readyForRequest",
      label:
        "Is the technical breakdown complete and ready for Resource Request (D4.2)?",
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
