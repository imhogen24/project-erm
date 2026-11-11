import { defineTool } from "@/server/tools/define-tool"

// The options the workflow reads, so they must not change. Sent is set when
// the email goes out; the delivery tracking moves it on (RDP-151).
export const deliveryStatuses = ["Sent", "Delivered", "Bounced"] as const

const dispatch = "1.0 Dispatch metadata"

const template = "2.0 Standard email template"

// Date, time and status describe the sending, so they exist only once the PM
// presses Send.
const whenSent = "Filled in when the email is sent"

// The acknowledgement email the client gets once their request is recorded.
// The OM prepares it, and it saves by itself; the PM sends it, which is the
// PM's approval of D1.4 (server/acknowledgement). It goes from the noreply
// address; Sent By is the project's OM, the IMHOGEN rep it comes from. One
// definition serves both tiers. The sheet is the source:
// docs/dev_docs/WORKBOOK_01, D1.4.
export const d14 = defineTool({
  id: "D1.4",
  name: "Acknowledgement Email",
  workbook: "wb01",
  autosave: true,
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
      key: "subject",
      label: "Subject Line",
      type: "text",
      required: true,
      section: dispatch,
    },
    {
      key: "sentBy",
      label: "Sent By",
      type: "text",
      systemFilled: true,
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
      key: "timeSent",
      label: "Time Sent",
      type: "time",
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "deliveryStatus",
      label: "Delivery Status",
      type: "select",
      options: [...deliveryStatuses],
      systemFilled: true,
      systemNote: whenSent,
      section: dispatch,
    },
    {
      key: "body",
      label: "Standard Email Template",
      type: "longText",
      required: true,
      section: template,
    },
  ],
})
