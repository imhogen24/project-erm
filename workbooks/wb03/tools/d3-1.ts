import { complianceRules, paymentMilestones, yesNo } from "@/lib/payment-terms"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Contract Metadata"

const verification = "4.0 Finance Handoff Verification"

const onSubmit = "Filled in when D3.1 is submitted"

// The payment terms extract, the first tool of Workbook 3, on both tiers,
// opened when D2.12 locks. 1.0 is the system's and shows the executed
// contract and D2.12. 2.0 starts on the sheet's three milestones, the first
// on D2.1's advance %, and each row's Amount Due is its percentage of the
// Total Project Value, worked out as it is typed; the percentages must add
// up to 100. 3.0 starts on the sheet's four money rules, the currency's from
// D2.1's Default Currency (server/payments/payment-terms). The FO signs and
// submits, and the PM approves it, which locks it, or sends it back.
export const d31 = defineTool({
  id: "D3.1",
  name: "Payment Terms Extract",
  workbook: "wb03",
  tier: "both",
  submitNeeds: [
    {
      field: "foSignature",
      message: "Sign as the Finance Officer before submitting",
    },
  ],
  submitWhen: [
    {
      field: "accepted",
      is: "Yes",
      message: "Answer Yes once you have reviewed and accepted this extraction",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "extractedBy",
      label: "Extracted By (Admin)",
      type: "text",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "extractionDate",
      label: "Extraction Date",
      type: "date",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "executedPdf",
      label: "Link to Executed PDF",
      type: "pdfPreview",
      source: { upload: { tool: "D2.12", field: "executedPdf" } },
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
      key: "totalProjectValue",
      label: "Total Project Value (GHS)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "paymentSchedule",
      label: "2.0 Approved Payment Schedule (From Executed Contract)",
      type: "table",
      required: true,
      fixedRows: paymentMilestones.map(() => ({})),
      sumsTo: {
        column: "percentage",
        value: 100,
        message: "The percentages must add up to exactly 100%",
      },
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "milestone",
          label: "Milestone Description",
          type: "text",
          required: true,
        },
        {
          key: "percentage",
          label: "Percentage (%)",
          type: "percentage",
          required: true,
        },
        {
          key: "amountDue",
          label: "Amount Due (GHS)",
          type: "currency",
          systemFilled: true,
          computed: { times: "percentage", by: "totalProjectValue" },
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          required: true,
          placeholders: paymentMilestones.map(() => "e.g. Section 3.3.1"),
        },
      ],
    },
    {
      key: "complianceRules",
      label: "3.0 Financial Compliance Rules",
      type: "table",
      required: true,
      fixedRows: complianceRules.map(({ category }) => ({ category })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "category",
          label: "Rule Category",
          type: "text",
          required: true,
        },
        {
          key: "term",
          label: "Agreed Term",
          type: "text",
          required: true,
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          required: true,
        },
      ],
    },
    {
      key: "accepted",
      label: "Has the Finance Officer reviewed and accepted this extraction?",
      type: "select",
      options: yesNo,
      required: true,
      section: verification,
    },
    {
      key: "foSignature",
      label: "Finance Officer Signature",
      type: "signature",
      signedBy: ["FO"],
      section: verification,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Finance Officer signs",
      section: verification,
    },
  ],
})
