import {
  DONE,
  PENDING,
  pendingOrDone,
  workspaces,
  yesNo,
} from "@/lib/access-log"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Onboarding Metadata"

const confirmation = "3.0 Engineer Confirmation"

const onSubmit = "Filled in when D4.4 is submitted"

// The access confirmation log, the fourth tool of Workbook 4, on Tier 1
// only, opened once D4.3 locks. 1.0 is the system's, its Total Team Size
// the engineers on D4.3's locked roster (server/team/access-log). 2.0
// starts on the sheet's four workspaces, which can't be changed or removed;
// the HE may add rows after them. The HE signs and submits once every row
// is verified and Done and 3.0 is Yes, and the PM approves it, which locks
// it, or sends it back.
export const d44 = defineTool({
  id: "D4.4",
  name: "Access Confirmation Log",
  workbook: "wb04",
  tier: 1,
  submitNeeds: [
    {
      field: "adminSignature",
      message: "Sign as the Head of Engineering before submitting",
    },
  ],
  submitWhen: [
    {
      field: "accessChecklist",
      column: "verified",
      is: "Yes",
      message: "Answer every Verification Check Yes before submitting",
    },
    {
      field: "accessChecklist",
      column: "status",
      is: DONE,
      message: "Mark every workspace Done before submitting",
    },
    {
      field: "engineersConfirmed",
      is: "Yes",
      message:
        "Answer Yes once every assigned engineer has confirmed they can open the shared folders",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "executedBy",
      label: "Executing Admin/IT",
      type: "text",
      systemFilled: true,
      systemNote: onSubmit,
      section: metadata,
    },
    {
      key: "executedDate",
      label: "Date Executed",
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
      key: "teamSize",
      label: "Total Team Size",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "accessChecklist",
      label: "2.0 Cloud & Server Access Checklist",
      type: "table",
      required: true,
      fixedRows: workspaces.map(({ workspace, action }) => ({
        workspace,
        action,
      })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "workspace",
          label: "Digital Workspace",
          type: "text",
          required: true,
        },
        {
          key: "action",
          label: "Required Action",
          type: "text",
          required: true,
        },
        {
          key: "verified",
          label: "Verification Check",
          type: "select",
          options: yesNo,
          required: true,
          placeholders: workspaces.map(({ check }) => check),
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: pendingOrDone,
          startsAs: PENDING,
          required: true,
        },
      ],
    },
    {
      key: "engineersConfirmed",
      label:
        "Have all assigned engineers explicitly confirmed they can open the shared folders?",
      type: "select",
      options: yesNo,
      required: true,
      section: confirmation,
    },
    {
      key: "adminSignature",
      label: "Admin Signature",
      type: "signature",
      signedBy: ["HE"],
      section: confirmation,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Head of Engineering signs",
      section: confirmation,
    },
  ],
})
