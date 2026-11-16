import { markupLayers } from "@/lib/cost-estimation"
import { defineTool } from "@/server/tools/define-tool"

const labor = "1.0 Base technical labor cost (from pricing calculator)"

const direct = "2.0 Direct project costs (prototypes & materials)"

const markups = "3.0 Institutional markup layers (protecting the business)"

const budget = "4.0 Final allocated budget (client-facing numbers)"

const routing = "5.0 Financial routing & approval"

// The cost estimate behind the quotation, on both tiers. The LE types the
// labor, the direct costs, the markup rates and how the total is allocated to
// the deliverables of D1.13's scope; every total, the allocation check and
// whether D1.12's cost floor is met are the system's (lib/cost-estimation),
// worked out as the LE types and stored when the sheet is submitted. The LE
// signs and submits; the PM signs and approves, which locks it. D1.15 opens
// only when the minimum overhead recovery is met (server/workflow/wb01.ts).
export const d114 = defineTool({
  id: "D1.14",
  name: "Cost Estimation Sheet",
  workbook: "wb01",
  fields: [
    {
      key: "labor",
      label: "Base technical labor cost",
      type: "table",
      required: true,
      section: labor,
      startsWithRow: true,
      subtotal: "total",
      subtotalLabel: "Base Labor Subtotal",
      columns: [
        {
          key: "module",
          label: "Engineering Module (e.g. Mechanical/Electronics)",
          type: "text",
          required: true,
        },
        {
          key: "days",
          label: "Estimated Days",
          type: "number",
          required: true,
        },
        {
          key: "dailyRate",
          label: "Daily Rate (GHS)",
          type: "currency",
          required: true,
        },
        {
          key: "total",
          label: "Total Labor Cost (GHS)",
          type: "currency",
          systemFilled: true,
        },
      ],
    },
    {
      key: "directCosts",
      label: "Direct project costs",
      type: "table",
      section: direct,
      subtotal: "total",
      subtotalLabel: "Direct Cost Subtotal",
      columns: [
        {
          key: "item",
          label: "Item Description",
          type: "text",
          required: true,
        },
        {
          key: "quantity",
          label: "Quantity",
          type: "number",
          required: true,
        },
        {
          key: "unitCost",
          label: "Unit Cost (GHS)",
          type: "currency",
          required: true,
        },
        {
          key: "total",
          label: "Total Cost (GHS)",
          type: "currency",
          systemFilled: true,
        },
      ],
    },
    {
      key: "markups",
      label: "Institutional markup layers",
      type: "table",
      required: true,
      section: markups,
      lockedRows: markupLayers,
      columns: [
        {
          key: "category",
          label: "Cost Layer Category",
          type: "text",
          required: true,
        },
        {
          key: "rate",
          label: "Applied Rate (%)",
          type: "percentage",
          required: true,
        },
        {
          key: "value",
          label: "Calculated Value (GHS)",
          type: "currency",
          systemFilled: true,
        },
        {
          key: "notes",
          label: "Notes / Justification",
          type: "longText",
        },
      ],
    },
    {
      key: "totalProjectValue",
      label: "Total Project Value",
      type: "text",
      systemFilled: true,
      section: markups,
    },
    {
      key: "allocations",
      label: "Final allocated budget",
      type: "table",
      required: true,
      section: budget,
      startsWithRow: true,
      subtotal: "cost",
      subtotalLabel: "Total Allocated",
      columns: [
        {
          key: "deliverable",
          label: "Deliverable Category (Must match SOW D1.13)",
          type: "text",
          required: true,
        },
        {
          key: "cost",
          label: "Fully Loaded Alloc. Cost (GHS)",
          type: "currency",
          required: true,
        },
      ],
    },
    {
      key: "allocationCheck",
      label: "Allocation Check",
      type: "text",
      systemFilled: true,
      section: budget,
    },
    {
      key: "costFloor",
      label: "IMHOGEN Cost Floor (D1.12)",
      type: "text",
      systemFilled: true,
      section: routing,
    },
    {
      key: "minimumOverheadMet",
      label: "Is the minimum overhead recovery met?",
      type: "boolean",
      systemFilled: true,
      section: routing,
    },
    {
      key: "readyForBriefing",
      label: "Ready for Project Briefing (D1.15)?",
      type: "text",
      systemFilled: true,
      section: routing,
    },
    {
      key: "leadEngineerSignature",
      label: "Lead Engineer Signature",
      type: "signature",
      signedBy: ["LE"],
      section: routing,
    },
    {
      key: "financeSignature",
      label: "Head of R&D / Finance Sig",
      type: "signature",
      signedBy: ["PM"],
      section: routing,
    },
  ],
})
