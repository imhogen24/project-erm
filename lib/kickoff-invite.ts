// D4.6, the kick-off calendar invite and agenda, the sixth tool of Workbook
// 4, on Tier 1 only, opened once D4.5 locks: the PM sets the internal
// kick-off's date, time and place, checks the invite script and sends it,
// with a calendar file, to every engineer on D4.3's roster.

export const KICKOFF_INVITE = "D4.6"

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// Kick-off times are IMHOGEN's own, Ghana time.
export const KICKOFF_ZONE = "Africa/Accra"

// The agenda's four items add up to 40 minutes.
export const KICKOFF_MINUTES = 40

export const kickoffAgenda = [
  "1. Review of Client Objectives & Scope (10 mins)",
  "2. Timeline & Deliverable Breakdown (10 mins)",
  "3. Technical Risk Assessment & Brainstorming (15 mins)",
  "4. Day 1 Task Assignments (5 mins)",
]

// The sheet's internal invite script, with `[Project Name]` filled in.
export function kickoffScriptFor(projectName: string) {
  return [
    "Team",
    `We are officially kicking off engineering execution for ${projectName}. The contract is signed, the advance payment has cleared (D3.10), and your time has been secured.`,
    "Please review the attached project documentation before the meeting. The agenda is as follows:",
    kickoffAgenda.join("\n"),
    "Attendance is mandatory to establish our project baseline.",
  ].join("\n\n")
}
