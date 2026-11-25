import { INITIAL_DRAFT } from "@/lib/initial-draft"
import { PENDING, clientResponses, yesNo } from "@/lib/transmittal"
import { defineTool } from "@/server/tools/define-tool"

const dispatch = "1.0 Dispatch metadata"

const script = "2.0 Standard transmittal email script (copy & paste)"

const tracking = "3.0 CRM & follow-up tracking"

const whenSent = "Filled in when the email is sent"

// The draft contract's first trip to the client, on both tiers, opened once
// D2.6 locks. The CA checks the email and presses Send, which emails the
// client with the draft contract's PDF attached (server/contract/transmittal)
// and fills in who sent it and when. After that, what was sent cannot change,
// and three days on the app reminds the client if they have not answered and
// the follow-up is Yes. The CA records the client's first reply and submits,
// which locks it. Which tool follows which reply is set when D2.8 and D2.10
// are built.
export const d27 = defineTool({
  id: "D2.7",
  name: "Client Transmitted Record",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  freezesOnceSet: {
    field: "dateSent",
    fields: ["ccBcc", "quoteExpiry", "script", "followUpScheduled"],
  },
  submitNeeds: [
    { field: "sentBy", message: "Send the email to the client first" },
  ],
  submitWhen: [
    {
      field: "initialResponse",
      isNot: PENDING,
      message: "Record the client's reply before submitting",
    },
  ],
  fields: [
    {
      key: "sentTo",
      label: "Sent To (Client Email)",
      type: "email",
      systemFilled: true,
      section: dispatch,
    },
    { key: "ccBcc", label: "CC / BCC", type: "text", section: dispatch },
    {
      key: "sentBy",
      label: "Sent By",
      type: "text",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "dateSent",
      label: "Date Sent",
      type: "date",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "subject",
      label: "Subject Line",
      type: "text",
      systemFilled: true,
      section: dispatch,
    },
    {
      key: "timeSent",
      label: "Time Sent",
      type: "time",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "fileAttached",
      label: "File Attached",
      type: "pdfPreview",
      source: { tool: INITIAL_DRAFT },
      section: dispatch,
    },
    {
      key: "quoteExpiry",
      label: "Quote Expiry Date",
      type: "date",
      required: true,
      section: dispatch,
    },
    {
      key: "script",
      label: "Standard Transmittal Email Script",
      type: "longText",
      required: true,
      section: script,
    },
    {
      key: "sentEmailLink",
      label: "Link to Sent Email (CRM/Workspace)",
      type: "fileLink",
      systemFilled: true,
      systemNote: whenSent,
      section: tracking,
    },
    {
      key: "followUpScheduled",
      label: "Auto-Follow-Up Scheduled? (3 Days post-send)",
      type: "select",
      options: yesNo,
      required: true,
      section: tracking,
    },
    {
      key: "followUpDate",
      label: "Follow-Up Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the email is sent with a follow-up",
      section: tracking,
    },
    {
      key: "initialResponse",
      label: "Initial Client Response",
      type: "select",
      options: clientResponses,
      required: true,
      section: tracking,
    },
  ],
})
