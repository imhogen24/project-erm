import { defineTool } from "@/server/tools/define-tool"

// The triage of a new request, on Tier 1 and Tier 3 alike. The metadata is read
// live from the saved website request, and the files live from D1.1, so
// neither is typed by the OM. Only the OM's description of each file is kept,
// matched to D1.1's file by its place in the list, which never changes after
// the intake. The workflow map reads `triageDecision` and its two options.
export const d12 = defineTool({
  id: "D1.2",
  name: "Initial Inquiry Notification",
  workbook: "wb01",
  fields: [
    {
      key: "notificationSource",
      label: "Notification Source",
      type: "select",
      options: ["Web Form", "Direct Email", "Phone", "Walk-in", "Other"],
      systemFilled: true,
    },
    {
      key: "dateReceived",
      label: "Date Received",
      type: "date",
      systemFilled: true,
    },
    {
      key: "timeReceived",
      label: "Time Received",
      type: "time",
      systemFilled: true,
    },
    {
      key: "senderEmail",
      label: "Sender Email Address",
      type: "email",
      systemFilled: true,
    },
    {
      key: "recipientEmail",
      label: "Recipient (IMHOGEN) Address",
      type: "email",
      systemFilled: true,
    },
    {
      key: "subjectLine",
      label: "Subject Line",
      type: "text",
      systemFilled: true,
    },
    {
      key: "digitalRecords",
      label: "Attached / Referenced Files",
      type: "table",
      columns: [
        { key: "fileName", label: "File Name / Description", type: "text" },
      ],
    },
    {
      key: "triageChecklist",
      label: "Triage Checklist",
      type: "table",
      required: true,
      prefilledRows: [
        "Is the notification readable and free of malicious links?",
        "Does the request broadly align with IMHOGEN's services?",
        "Is the contact information apparently valid and legible?",
      ],
      columns: [
        { key: "check", label: "Check", type: "text" },
        {
          key: "status",
          label: "Status (Pass / Fail)",
          type: "select",
          options: ["Pass", "Fail"],
          required: true,
        },
        {
          key: "reviewerNotes",
          label: "Reviewer Notes",
          type: "longText",
          required: true,
        },
      ],
    },
    {
      key: "triageDecision",
      label: "Triage Decision",
      type: "select",
      options: ["Proceed to D1.3", "Reject as Spam"],
      required: true,
      // Reject as Spam is always allowed. The reviewer notes give its reason.
      blockedWhile: {
        option: "Proceed to D1.3",
        table: "triageChecklist",
        column: "status",
        value: "Fail",
        message: "Cannot proceed while a check is Fail",
      },
    },
  ],
})
