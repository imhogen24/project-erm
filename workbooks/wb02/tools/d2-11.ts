import {
  CLIENT_ROLE,
  COURIER,
  DIGITAL,
  IMHOGEN_ROLE,
  SIGNED,
  PENDING,
  routingMethods,
  signatureStatuses,
  yesNo,
} from "@/lib/signature-contract"
import { defineTool } from "@/server/tools/define-tool"

const dispatch = "1.0 Dispatch metadata"

const script = "2.0 Standard signature request script (Copy & paste)"

const tracker = "3.0 Signature status tracker"

const escalation = "4.0 Escalation"

const whenSent = "Filled in when the contract is sent"

const inApp = { field: "routingMethod", is: DIGITAL }

// The pending signature contract, on both tiers, opened when D2.10 locks.
// The CA uploads the final contract, writes the email and presses Send
// (server/contract/signature-contract), which fixes what was sent. With
// Digital Signature, the client then signs here, then the HE, whose
// signature locks D2.11; the app reminds the client every three days if
// asked, and flags the contract to the CA and PM at seven days unsigned.
// With Physical Courier there is nothing to sign here: the CA records the
// paper signatures in 3.0 and submits, which locks it. Only the CA saves the
// form; the client and the HE only sign.
export const d211 = defineTool({
  id: "D2.11",
  name: "Pending Signature Contract",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  writers: ["CA"],
  signInTurn: {
    order: ["clientSignature", "heSignature"],
    from: "dispatchConfirmed",
  },
  freezesOnceSet: {
    field: "dateDispatched",
    fields: [
      "routingMethod",
      "sentTo",
      "imhogenSignatory",
      "autoReminder",
      "finalContract",
      "script",
    ],
  },
  submitNeeds: [
    {
      field: "dispatchConfirmed",
      message: "Send the contract to the client first",
    },
  ],
  submitWhen: [
    {
      field: "routingMethod",
      is: COURIER,
      message:
        "With Digital Signature, the client and the Head of Engineering sign it here",
    },
    {
      field: "signatories",
      column: "status",
      is: SIGNED,
      message: "Set both signatories to Signed once the signed copy is back",
    },
  ],
  fills: { "Client Name": "system", "IMHOGEN Rep": "system" },
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: dispatch,
    },
    {
      key: "routingMethod",
      label: "Routing Method",
      type: "select",
      options: routingMethods,
      required: true,
      section: dispatch,
    },
    {
      key: "dateDispatched",
      label: "Date Dispatched",
      type: "date",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "sentTo",
      label: "Sent To (Client Signatory)",
      type: "text",
      required: true,
      placeholder: "Name & Email",
      section: dispatch,
    },
    {
      key: "imhogenSignatory",
      label: "IMHOGEN Signatory",
      type: "text",
      required: true,
      placeholder: "Name & Title",
      section: dispatch,
    },
    {
      key: "signatureLink",
      label: "Link to Signature Platform",
      type: "fileLink",
      systemFilled: true,
      systemNote: "Filled in when the contract is sent for Digital Signature",
      section: dispatch,
    },
    {
      key: "autoReminder",
      label: "Auto-Reminder Set?",
      type: "select",
      options: yesNo,
      required: true,
      section: dispatch,
    },
    {
      key: "finalContract",
      label: "Final Contract PDF",
      type: "fileLink",
      pdfOnly: true,
      required: true,
      section: dispatch,
    },
    {
      key: "script",
      label: "Standard Signature Request Script",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "signatories",
      label: tracker,
      type: "table",
      readOnlyWhen: inApp,
      fixedRows: [
        { signatory: "[Client Name]", role: CLIENT_ROLE },
        { signatory: "[IMHOGEN Rep]", role: IMHOGEN_ROLE },
      ],
      columns: [
        { key: "signatory", label: "Signatory", type: "text", required: true },
        { key: "role", label: "Role", type: "text", required: true },
        {
          key: "dateViewed",
          label: "Date Viewed",
          type: "date",
          systemFilled: true,
        },
        {
          key: "dateSigned",
          label: "Date Signed",
          type: "date",
          required: true,
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: signatureStatuses,
          startsAs: PENDING,
          required: true,
        },
      ],
    },
    {
      key: "clientSignature",
      label: "Client Signature",
      type: "signature",
      signedBy: ["Client"],
      viewedAs: "clientViewedAt",
      onlyWhen: inApp,
      section: tracker,
    },
    {
      key: "heSignature",
      label: "IMHOGEN Signature (Head of Engineering)",
      type: "signature",
      signedBy: ["HE"],
      viewedAs: "heViewedAt",
      onlyWhen: inApp,
      section: tracker,
    },
    {
      key: "overdue",
      label: "Has the contract been pending signature for more than 7 days?",
      type: "select",
      options: yesNo,
      systemFilled: true,
      section: escalation,
    },
    {
      key: "actionTaken",
      label: "Action Taken",
      type: "text",
      placeholder: "e.g. Called Client",
      section: escalation,
    },
    // When the contract went, to the second, for the reminders; when the
    // email service took it, which opens signing; and when each signer first
    // opened it once it was their turn.
    {
      key: "dispatchedAt",
      label: "Sent at",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "dispatchConfirmed",
      label: "Sent and confirmed at",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "clientViewedAt",
      label: "Client viewed",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
    {
      key: "heViewedAt",
      label: "Head of Engineering viewed",
      type: "text",
      systemFilled: true,
      hidden: true,
    },
  ],
})
