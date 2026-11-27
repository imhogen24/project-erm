// D4.4, the access confirmation log, the fourth tool of Workbook 4, on Tier 1
// only, opened once D4.3 locks: the Head of Engineering sets up the team's
// shared folders and channels, ticks each one off, confirms every engineer
// can open them, signs and submits, and the PM approves it.

export const ACCESS_LOG = "D4.4"

export const yesNo = ["Yes", "No"]

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

// 2.0's fixed workspaces, in the sheet's order, each with the action the HE
// takes and the question its Verification Check answers.
export const workspaces = [
  {
    workspace: "Google Drive Workspace",
    action: "Create Client Root Folder & Add Team",
    check: "Link provided?",
  },
  {
    workspace: "CAD Vault / Server",
    action: "Create Project Repo & Grant Read/Write",
    check: "Permissions verified?",
  },
  {
    workspace: "Communication Channel",
    action: "Create WhatsApp/Slack Group & Add Team",
    check: "PM made Admin?",
  },
  {
    workspace: "QMS Documentation Hub",
    action: "Link this Spoke to the D4 Master Hub",
    check: "Linked?",
  },
]

// Total Team Size as the sheet writes it, such as "3 Engineers".
export function teamSize(count: number): string {
  return `${count} ${count === 1 ? "Engineer" : "Engineers"}`
}
