import {
  t3Deliverables,
  t3Exclusions,
  t3PricingLines,
} from "@/lib/project-brief"
import { defineTool } from "@/server/tools/define-tool"

const scope = "1.0 Scope of deliverables"

const pricing = "2.0 Pricing summary (GHS)"

const exclusions = "3.0 Mandatory exclusions"

// The Tier 3 drafting scope and quote, in place of D1.15. The LE gives each
// standard deliverable (or one they add) its quantity and delivery timeline,
// prices the three lines (each subtotal and the total are the system's, lib/
// project-brief), and may add exclusions after the three mandatory ones. The
// LE signs and submits; the PM approves, which locks it. The client reads it
// once approved.
export const t3d115a = defineTool({
  id: "T3.D1.15a",
  name: "T3 Drafting SOW & Quote",
  workbook: "wb01",
  tier: 3,
  replaces: "D1.15",
  clientReadsOnceLocked: true,
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: scope,
    },
    {
      key: "deliverables",
      label: "Scope of deliverables",
      type: "table",
      required: true,
      section: scope,
      lockedRows: t3Deliverables.map((each) => each.item),
      optionalRows: t3Deliverables.map((each) => each.item),
      columns: [
        { key: "item", label: "Service Item", type: "text", required: true },
        {
          key: "description",
          label: "Technical Description",
          type: "text",
          required: true,
        },
        { key: "qty", label: "Qty", type: "number", required: true },
        {
          key: "timeline",
          label: "Delivery Timeline",
          type: "text",
          required: true,
        },
        { key: "format", label: "Format", type: "text", required: true },
      ],
    },
    {
      key: "pricing",
      label: "Pricing summary",
      type: "table",
      required: true,
      section: pricing,
      lockedRows: t3PricingLines,
      columns: [
        {
          key: "description",
          label: "Description",
          type: "text",
          required: true,
        },
        { key: "rate", label: "Rate", type: "currency", required: true },
        { key: "qty", label: "Qty", type: "number", required: true },
        {
          key: "subtotal",
          label: "Subtotal",
          type: "currency",
          systemFilled: true,
        },
        { key: "financeNotes", label: "Finance Notes", type: "text" },
      ],
    },
    {
      key: "totalT3ProjectValue",
      label: "Total T3 Project Value",
      type: "text",
      systemFilled: true,
      section: pricing,
    },
    {
      key: "exclusions",
      label: "Mandatory exclusions",
      type: "table",
      required: true,
      section: exclusions,
      lockedRows: t3Exclusions,
      columns: [
        {
          key: "exclusion",
          label: "Exclusion",
          type: "text",
          required: true,
        },
      ],
    },
    {
      key: "leadEngineerSignature",
      label: "Lead Engineer Signature",
      type: "signature",
      signedBy: ["LE"],
      section: exclusions,
    },
  ],
})
