import { PROCEED, REJECTED, actions, yesNo } from "@/lib/billing-trigger"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Trigger Metadata"

const verification = "2.0 Milestone Verification"

const authorization = "3.0 Engineering Authorization"

const finance = "4.0 Finance Receipt & Action"

const onSubmit = "Filled in when D3.3 is submitted"

const onDecision = "Filled in when the Finance Officer acts"

// The milestone billing trigger, on both tiers, run once per payment
// milestone: the first opens when D3.1 locks, and the next as soon as the
// Finance Officer approves the one before (server/workflow/wb03.ts). 1.0 is
// the system's. The PM picks the milestone from D3.1's schedule, the
// advance and milestones already triggered shown but not pickable, and
// Contractual Milestone Value shows its % and amount. The PM uploads the
// proof, answers that the client accepted it and that no dispute is open,
// signs and submits. The FO approves, which records Proceed and locks it,
// or sends it back, which records Rejected (server/payments/billing-trigger).
export const d33 = defineTool({
  id: "D3.3",
  name: "Milestone Billing Trigger",
  workbook: "wb03",
  tier: "both",
  submitNeeds: [
    {
      field: "proofOfCompletion",
      message: "Upload the proof of completion before submitting",
    },
    {
      field: "pmSignature",
      message: "Sign as the Project Manager before submitting",
    },
  ],
  submitWhen: [
    {
      field: "clientAccepted",
      is: "Yes",
      message:
        "The client has not formally accepted this milestone, so it cannot be billed yet",
    },
    {
      field: "openDisputes",
      is: "No",
      message:
        "An engineering dispute is still open on this phase, so it cannot be billed yet",
    },
  ],
  decision: {
    field: "actionTaken",
    approve: PROCEED,
    sendBack: REJECTED,
    by: "financeOfficer",
    receivedOn: "dateReceived",
  },
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "triggerSentBy",
      label: "Trigger Sent By (Project Manager)",
      type: "text",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "dateSent",
      label: "Date Sent",
      type: "date",
      systemFilled: true,
      systemNote: onSubmit,
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
      key: "recipient",
      label: "Recipient (Finance Officer)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "milestone",
      label: "Milestone Achieved",
      type: "select",
      options: [],
      optionsFrom: {
        tool: "D3.1",
        field: "paymentSchedule",
        column: "milestone",
        takenBefore: 1,
      },
      required: true,
      section: verification,
    },
    {
      key: "proofOfCompletion",
      label: "Proof of Completion Link",
      type: "fileLink",
      pdfOrImage: true,
      section: verification,
    },
    {
      key: "milestoneValue",
      label: "Contractual Milestone Value",
      type: "text",
      systemFilled: true,
      systemNote: "Shown once a milestone is picked",
      section: verification,
    },
    {
      key: "clientAccepted",
      label: "Has the client formally accepted this milestone deliverable?",
      type: "select",
      options: yesNo,
      required: true,
      section: authorization,
    },
    {
      key: "openDisputes",
      label:
        "Are there any outstanding engineering disputes regarding this phase?",
      type: "select",
      options: yesNo,
      required: true,
      section: authorization,
    },
    {
      key: "pmSignature",
      label: "Project Manager Signature",
      type: "signature",
      signedBy: ["PM"],
      section: authorization,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: authorization,
    },
    {
      key: "dateReceived",
      label: "Date Trigger Received",
      type: "date",
      systemFilled: true,
      systemNote: onSubmit,
      section: finance,
    },
    {
      key: "financeOfficer",
      label: "Finance Officer",
      type: "text",
      systemFilled: true,
      systemNote: onDecision,
      section: finance,
    },
    {
      key: "actionTaken",
      label: "Action Taken",
      type: "select",
      options: actions,
      systemFilled: true,
      systemNote: onDecision,
      section: finance,
    },
  ],
})
