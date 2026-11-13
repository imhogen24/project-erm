import {
  priorityLevels,
  reviewDirectives,
  reviewStatuses,
} from "@/lib/internal-review"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Review initiation metadata"

const references = "2.0 Context & reference material"

const directives = "3.0 Specific review directives & assignments"

// The internal memo that starts the feasibility review, on both tiers. What
// the system holds (who requests it, the client, the synthesis date, the
// timeline and project from the web request, and the records to read) is
// filled in by server/review. The OM sets the objective and priority, and
// assigns and tracks each review; the HE approves, which locks it and opens
// D1.10, or sends it back.
export const d19 = defineTool({
  id: "D1.9",
  name: "Internal Review Request",
  workbook: "wb01",
  fields: [
    {
      key: "requestedBy",
      label: "Requested By (Lead/PM)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "clientName",
      label: "Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "synthesisDate",
      label: "Date of Synthesis",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "requiredCompletion",
      label: "Required Completion Date",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "primaryObjective",
      label: "Primary Review Objective",
      type: "longText",
      required: true,
      section: metadata,
    },
    {
      key: "priority",
      label: "Priority Level",
      type: "select",
      options: priorityLevels,
      required: true,
      section: metadata,
    },
    {
      key: "projectTitle",
      label: "Project",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "referenceMaterial",
      label: "Context & reference material (required reading)",
      type: "table",
      systemFilled: true,
      readOnly: true,
      section: references,
      columns: [
        { key: "document", label: "Document Name", type: "text" },
        { key: "link", label: "Direct Link to Document", type: "text" },
        { key: "status", label: "Status", type: "text" },
      ],
    },
    {
      key: "reviews",
      label: "Specific review directives & assignments",
      type: "table",
      section: directives,
      prefilledRows: reviewDirectives.map((each) => each.category),
      columns: [
        { key: "category", label: "Review Category", type: "text" },
        {
          key: "reviewer",
          label: "Assigned Reviewer",
          type: "text",
          required: true,
        },
        {
          key: "focus",
          label: "Specific Focus / Question for Reviewer",
          type: "longText",
          required: true,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: reviewStatuses,
          required: true,
        },
      ],
    },
  ],
})
