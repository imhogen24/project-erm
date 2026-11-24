import { clauseStatuses, standardClauses } from "@/lib/standard-contract"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Template metadata"

const clauses = "2.0 Standard legal clauses (base text for copying to D2.2)"

const appendices = "3.0 Standard appendices to attach (required for D2.2)"

// The standard contract template, on both tiers, opened once D1.16 locks.
// 1.0 starts filled in (server/contract) and the CA may change it. 2.0 holds
// the sheet's eight clauses, fixed except for their status, with their
// [bracketed] values filled in from the project when shown; the CA may add
// clauses after them. 3.0 shows the appendices as PDFs. Nobody approves it:
// the CA submits it, which locks it and opens D2.2.
export const d21 = defineTool({
  id: "D2.1",
  name: "Standard Contract Template",
  workbook: "wb02",
  locksOnSubmit: true,
  fills: {
    "Client Name": "system",
    "Total GHS": "system",
    X: { field: "executionPercentage" },
  },
  fields: [
    {
      key: "lastLegalReviewDate",
      label: "Last Legal Review Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "reviewedBy",
      label: "Reviewed By (Legal/Exec)",
      type: "text",
      required: true,
      section: metadata,
    },
    {
      key: "jurisdiction",
      label: "Governing Jurisdiction",
      type: "text",
      required: true,
      section: metadata,
    },
    {
      key: "currency",
      label: "Default Currency",
      type: "text",
      required: true,
      section: metadata,
    },
    // Not on the sheet: the [X]% of the Payment Terms clause, typed here
    // rather than read from D1.15's free-text payment schedule.
    {
      key: "executionPercentage",
      label: "Payable upon Execution (%)",
      type: "percentage",
      required: true,
      section: clauses,
    },
    {
      key: "clauses",
      label: "Standard legal clauses",
      type: "table",
      required: true,
      section: clauses,
      fixedRows: standardClauses.map((clause) => ({
        category: clause.category,
        text: clause.text,
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "category",
          label: "Clause Category",
          type: "text",
          required: true,
        },
        {
          key: "text",
          label: "Standard Clause Text",
          type: "longText",
          required: true,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: clauseStatuses,
          startsAs: "Active",
          required: true,
        },
      ],
    },
    {
      key: "appendixA",
      label: "Appendix A",
      type: "pdfPreview",
      source: { tool: "D1.15" },
      section: appendices,
    },
    {
      key: "appendixB",
      label: "Appendix B",
      type: "pdfPreview",
      source: { tool: "D1.13" },
      section: appendices,
    },
    {
      key: "appendixC",
      label: "Appendix C",
      type: "pdfPreview",
      source: { tool: "D1.11" },
      section: appendices,
    },
    {
      key: "appendixD",
      label: "Appendix D",
      type: "pdfPreview",
      source: {
        file: "imhogen-sla.pdf",
        title: "IMHO GEN Standard Service Level Agreement (SLA)",
      },
      section: appendices,
    },
  ],
})
