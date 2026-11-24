import {
  OVERHEAD_MET,
  financeNextSteps,
  financialElements,
  paymentMilestones,
  riskProtections,
} from "@/lib/finance-review"
import {
  PM_REVIEW,
  REVIEWED_DRAFT,
  REVISIONS_REQUIRED,
  accurateOrMismatch,
  verificationStatuses,
  yesNo,
} from "@/lib/pm-review"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Review metadata"

const conclusion = "5.0 Finance review conclusion & routing"

const onLock = "Filled in when D2.4 is submitted"

// Each table keeps the rows it starts with: the FO changes their text and
// answers them, and can add rows after them and remove those.
function startingRows(count: number) {
  return Array.from({ length: count }, () => ({}))
}

// The Finance Officer's review of the draft contract, on both tiers, opened
// once the PM locks D2.3 with Approved. 1.0 is the system's and shows the
// draft and the PM's review. 2.0 to 4.0 start from the sheet's rows
// (server/contract/finance-review); row 2.2's Contract Clause Ref is D1.14's
// answer to whether the minimum overhead is met, read only. The FO signs and
// submits, which locks it: Approved is for D2.5, and Revisions Required sends
// the draft back to its writer as a new iteration, after which D2.3 and then
// D2.4 run again.
export const d24 = defineTool({
  id: "D2.4",
  name: "Finance Review Draft",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  sendsBackTo: {
    field: "commercialStatus",
    is: REVISIONS_REQUIRED,
    tools: [REVIEWED_DRAFT],
  },
  fills: { [OVERHEAD_MET]: "system" },
  fields: [
    {
      key: "financeOfficer",
      label: "Assigned Finance Officer",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "dateReceived",
      label: "Date Received for Review",
      type: "date",
      systemFilled: true,
      systemNote: "The day the PM's review was locked",
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
      key: "referenceDraft",
      label: "Reference Draft",
      type: "pdfPreview",
      source: { tool: REVIEWED_DRAFT },
      section: metadata,
    },
    {
      key: "pmReview",
      label: "PM Review (D2.3 Edits)",
      type: "pdfPreview",
      source: { tool: PM_REVIEW },
      section: metadata,
    },
    {
      key: "dateReviewCompleted",
      label: "Date Review Completed",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: metadata,
    },
    {
      key: "valueVerification",
      label: "2.0 Project value & margin verification",
      type: "table",
      required: true,
      // Row 2.2 shows D1.14's answer in place of a clause reference.
      fixedRows: financialElements.map((_, index) =>
        index === 1 ? { clauseRef: `[${OVERHEAD_MET}]` } : {}
      ),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "element",
          label: "Financial Element",
          type: "text",
          required: true,
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          placeholders: ["e.g. Section 3.1", "", "e.g. Section 3.2"],
        },
        {
          key: "status",
          label: "Status (Accurate / Mismatch)",
          type: "select",
          options: accurateOrMismatch,
          required: true,
        },
        {
          key: "comments",
          label: "Finance Comments / Required Edits",
          type: "text",
        },
      ],
    },
    {
      key: "paymentVerification",
      label: "3.0 Payment schedule & cash flow verification",
      type: "table",
      required: true,
      fixedRows: startingRows(paymentMilestones.length),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "3" },
        {
          key: "milestone",
          label: "Payment Milestone",
          type: "text",
          required: true,
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          placeholders: [
            "e.g. Section 3.3.1",
            "e.g. Section 3.3.2",
            "e.g. Section 3.3.3",
            "e.g. Section 3.4",
          ],
        },
        {
          key: "cashFlowSafe",
          label: "Cash Flow Safe? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        {
          key: "comments",
          label: "Finance Comments / Required Edits",
          type: "text",
        },
      ],
    },
    {
      key: "riskVerification",
      label: "4.0 Financial risk & compliance clauses",
      type: "table",
      required: true,
      fixedRows: startingRows(riskProtections.length),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "4" },
        {
          key: "protection",
          label: "Risk Protection Required",
          type: "text",
          required: true,
        },
        {
          key: "clauseRef",
          label: "Contract Clause Ref",
          type: "text",
          placeholders: [
            "e.g. Section 8.1",
            "e.g. Section 3.5",
            "e.g. Section 7.2",
          ],
        },
        {
          key: "protected",
          label: "Adequately Protected? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        { key: "comments", label: "Finance Comments", type: "text" },
      ],
    },
    {
      key: "commercialStatus",
      label: "Commercial Verification Status",
      type: "select",
      options: verificationStatuses,
      required: true,
      section: conclusion,
    },
    {
      key: "nextStepDirective",
      label: "Next Step Directive",
      type: "text",
      systemFilled: true,
      shownFrom: { field: "commercialStatus", values: financeNextSteps },
      systemNote: "Shown once a status is chosen",
      section: conclusion,
    },
    {
      key: "signOffDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      filledOnLock: "lockedAt",
      systemNote: onLock,
      section: conclusion,
    },
    // After the date, as in D2.3, so 5.0 stays one box above the signature.
    {
      key: "foSignature",
      label: "Finance Officer Signature",
      type: "signature",
      signedBy: ["FO"],
      section: conclusion,
    },
  ],
})
