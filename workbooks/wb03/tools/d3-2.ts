import { financialStatuses } from "@/lib/payment-record"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Tracking Metadata"

const health = "3.0 Overall Financial Health"

// The systems payment record, on both tiers, opened when D3.1 locks
// (server/workflow/wb03.ts): the project's payment ledger. 2.0 has one row
// per milestone of D3.1's schedule, read from it each time it is shown, so
// changing D3.1 changes the rows. The app fills in each row's amount, the
// day it was invoiced (D2.12 for the advance, the cycle's D3.6 after) and
// the day it cleared (D2.14 for the advance, the cycle's D3.8 after), and
// works out its status and the 3.0 totals (server/payments/payment-record).
// The Finance Officer sets the expected trigger dates and the financial
// status. It is a living record: no Submit, never locked, and nothing waits
// for it.
export const d32 = defineTool({
  id: "D3.2",
  name: "Systems Payment Record",
  workbook: "wb03",
  tier: "both",
  withoutSubmit: true,
  living: true,
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "trackingOfficer",
      label: "Tracking Officer",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "dateInitiated",
      label: "Date Initiated",
      type: "date",
      systemFilled: true,
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
      key: "referenceTerms",
      label: "Reference Terms",
      type: "pdfPreview",
      source: { tool: "D3.1" },
      section: metadata,
    },
    {
      key: "paymentSchedule",
      label: "2.0 Milestone Payment Schedule (Expected vs. Actual)",
      type: "table",
      rowsFrom: { tool: "D3.1", field: "paymentSchedule", keyedBy: "sn" },
      columns: [
        { key: "sn", label: "SN", type: "text", systemFilled: true },
        {
          key: "milestone",
          label: "Milestone Description",
          type: "text",
          systemFilled: true,
        },
        {
          key: "expectedAmount",
          label: "Expected Amount (GHS)",
          type: "currency",
          systemFilled: true,
        },
        {
          key: "expectedTriggerDate",
          label: "Expected Trigger Date",
          type: "date",
        },
        {
          key: "actualInvoiceDate",
          label: "Actual Invoice Date",
          type: "date",
          systemFilled: true,
        },
        {
          key: "actualClearanceDate",
          label: "Actual Clearance Date",
          type: "date",
          systemFilled: true,
        },
        {
          key: "status",
          label: "Variance / Status",
          type: "text",
          systemFilled: true,
        },
      ],
    },
    {
      key: "totalProjectValue",
      label: "Total Project Value (GHS)",
      type: "text",
      systemFilled: true,
      section: health,
    },
    {
      key: "totalCleared",
      label: "Total Amount Cleared (GHS)",
      type: "text",
      systemFilled: true,
      section: health,
    },
    {
      key: "outstandingBalance",
      label: "Outstanding Balance (GHS)",
      type: "text",
      systemFilled: true,
      section: health,
    },
    {
      key: "financialStatus",
      label: "Financial Status",
      type: "select",
      options: financialStatuses,
      section: health,
    },
  ],
})
