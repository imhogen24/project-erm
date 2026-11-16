import type { Role } from "@/db/schema"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { loginFor } from "./seed-data/people"
import {
  CURRENT_TOOL,
  NEEDS_TEAM,
  currentToolFor,
  approverOf,
  client,
  toolProjectName,
  writerOf,
} from "./seed-data/projects"

const fillIn = toolProjectName("Tier_1", "open")

const approve = toolProjectName("Tier_1", "submitted")

const approved = toolProjectName("Tier_1", "locked")

const tier3Tool = currentToolFor("Tier_3")

const tools =
  tier3Tool === CURRENT_TOOL ? CURRENT_TOOL : `${CURRENT_TOOL} and ${tier3Tool}`

const writer = writerOf(CURRENT_TOOL)

const approver = approverOf(CURRENT_TOOL)

// Each screen built so far, and how to see it. The issue that builds a screen
// adds its line here, then runs `bun run accounts:doc`, so
// docs/TEST_ACCOUNTS/_.md always says who to log in as, where to go, and what
// should be there.
export type Preview = {
  screen: string
  loginAs: Role
  // Someone other than the first person with the role, when the screen is on
  // a project that person is not on.
  email?: string
  path: (projectId: string) => string
  expect: string
}

export const previews: Preview[] = [
  {
    screen: `${tools}, being built, from every role's side`,
    loginAs: writer,
    path: () => "/",
    expect: `Your projects starts with three for ${CURRENT_TOOL} on Tier 1 and three for ${tier3Tool} on Tier 3: 1 Fill in (${writer}) has every tool before it locked and the tool open and empty for the ${writer}, ${loginFor(writer)}. 2 Approve (${approver}) has it submitted and waiting for the ${approver}, ${loginFor(approver)}, with Approve and Send back. 3 Approved has it locked. Everyone is on every one of them, so log in as any role (om@, pm@, le@, he@, qa@ ... @imhogen.test) to see what that role reads, and as the client, ${client.email}, to see what they get. Every password is password.`,
  },
  {
    screen: "D1.16 handoff meeting minutes, as the LE",
    loginAs: "LE",
    path: (id) => `/projects/${id}/tools/D1.16`,
    expect: `On ${fillIn}: 1.0 has Meeting Date and Meeting Time to choose; Reference Request ID, Lead Engineer (Handing Off), Contract Admin (Receiving), Project/Client Name and Project Value (GHS), D1.15's budget total, are the system's. 2.0: the reference document D1.15 Project Brief & Draft Budget with Open; Scope Summary to write; Payment Terms Agreed starts from D1.15's payment schedules. 3.0: Scope Exclusion, Timeline Risk and Financial Risk locked in place, each with its source (D1.13, D1.11, D1.15) and a directive to write; Add row for more. 4.0: the three checklist tasks with their assignees and a Pending / Done status. Sign Engineering Release and submit. On the Tier 3 projects the brief is T3.D1.15a.`,
  },
  {
    screen: "D1.16 approval, as the PM",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.16`,
    expect: `On ${approve}: the LE's minutes, read only, with Sign on Contracting Acceptance, then Approve and Send back. Approving locks it, which closes Workbook 1. On ${approved} it reads locked. The OM, HE and IT/Admin read it; the client does not see it.`,
  },
  {
    screen: "Every tool saves by itself (RDP-153)",
    loginAs: "OM",
    path: () => "/",
    expect: `Open ${DEV_UNLOCKED} (Tier 1), then D1.2. There is no Save draft: type a description or a reviewer note and, about a second later, the foot of the sheet says Saving… then ✓ Saved. Click another tool in the sidebar and come back: what you typed is there. Type and click away at once: it still saves, then goes. Turn the network off in the browser's dev tools and type: the foot says Not saved. Retrying…, and clicking a link asks Your latest changes are not saved yet. Leave anyway? with Leave and Stay; closing or reloading the tab asks too. Turn the network back on: it saves by itself and leaving no longer asks. Submit for approval stays. The same holds on every tool you may write, such as D1.8 as the LE (${loginFor("LE")}).`,
  },
  {
    screen: "Every tool built, locked or open",
    loginAs: "OM",
    path: () => "/",
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have every tool built locked with sample answers: open any tool as any role to see what that role reads. ${DEV_UNLOCKED} (Tier 1) and (Tier 3) have every tool of their tier open at once, empty, without waiting for the one before (development only, never in production): the client's web form is a draft the client can change, and every other tool starts from nothing. A tool that reads an earlier one, such as D1.6 reading D1.5's agreed time, says what it is missing until that one is filled in. D1.4 is sent by the PM: the OM prepares the email, the PM presses Send, and the D1.4 tile shows a Sent chip that turns Delivered once the Inngest dev server runs the delivery check.`,
  },
  {
    screen: "Projects that need a team (IT/Admin)",
    loginAs: "IT/Admin",
    path: () => "/admin/team",
    expect: `${NEEDS_TEAM} is the one running project with nobody on it. Open it to assign people: one of each role is free to take it, since the test projects take up nobody's workload slot. Assign staff in the sidebar has an orange count of 1.`,
  },
  {
    screen: "Every project as IT/Admin",
    loginAs: "IT/Admin",
    path: () => "/",
    expect:
      "Every project, Tier 1 and Tier 3. The IT/Admin holds no project role, so no project shows Your roles.",
  },
  {
    screen: "Project tree in the sidebar",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "On a wide screen, the left sidebar lists the 13 workbooks as folders (Onboarding (WB01), Contracting (WB02) and so on). Onboarding is open with its tools as links, each marked with its state. Click a tool to open it. The tree stays on the tool page, with the open tool highlighted. Each tool has a mark: grey dots when not started, orange dots moving clockwise while someone works on it, a solid orange square once locked, and a lock at the right that is open until the tool is locked. A tool that cannot open yet, because the one before it is not locked, is greyed out and is not a link; on the overview its tile says Opens after and the tool it waits on, and typing its address leads back to the overview.",
  },
  {
    screen: "Client sign-up and confirm email",
    loginAs: "Client",
    email: "nobody: sign up with an email you can open",
    path: () => "/sign-up",
    expect:
      "Create your account asks for full name, email and password; the sign-in page links here with Create an account. Create account opens Check your email with the address and Send the link again; signing in before confirming opens it too. The link really is emailed (an address ending in .test or example.com never is). Once confirmed, the client lands on Your projects with only Start new project, and any website request made with that email is already theirs.",
  },
  {
    screen: "Form tools on the same sheet (dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Plain fields sit together in a Details table (Field | Answer). Tables, checklists and read-only blocks each get their own titled box with the same ruled lines. Typing saves by itself a moment later (the Last sent box below shows it); Submit for approval sits in the action row at the foot. The same boxes are used by every tool that is a form, such as D1.3 once D1.2 is approved.",
  },
  {
    screen: "Tables with locked and added rows (RDP-144, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Find the table Locked and added rows. Its two rows, Primary purpose and Main deliverables, show a lock and have no Remove button. Press Add row: a third row opens with an editable name and a Remove button. D1.3 and T3.D1.3a use this table for their own tables once the OM can open them.",
  },
  {
    screen: "Sidebar avatar and sign out, rounded buttons",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "At the foot of the sidebar: a rounded avatar with the person's initials, and a rounded sign-out icon at the right. Hover or tab to the avatar: a tooltip says Signed in as and the name. Buttons and badges across the app are rounded; the grid boxes and tables stay square.",
  },
  {
    screen: "Client: start a new project",
    loginAs: "Client",
    email: client.email,
    path: () => "/",
    expect:
      "The client sees their projects, and the last square of the grid is Start new project with a plus. Press it, choose Tier 1 (Custom Engineering & Factory Solutions) or Tier 3 (Engineering Drafting & Digitization), and fill the same form as on the IMHOGEN website. File attachments has Add files: choose images or PDFs and each uploads at once, listed by name with a cross to remove it (needs UPLOADTHING_TOKEN). Send request creates the project with D1.1 locked and opens it; it waits for the IT/Admin to assign a team. D1.1 lists the files by name, and Open file opens each one.",
  },
  {
    screen: "Change requests on the project overview",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect: `On ${approved}, the PM sees Change requests waiting above the workbooks: the OM asks to change D1.1 Client Email / Web Form because the client sent a photo of the equipment nameplate. Approve or Reject sits beside it. The D1.1 tile below says Change requested.`,
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect: `A bell at the top right of the sidebar header (on a narrow screen, in the top bar) with a number on it: one unread note for each project where ${CURRENT_TOOL} waits for the ${approver}'s approval, and one for the change waiting on ${approved}, then older read notes. Click one: you go to its page and the number drops by 1. Mark all read clears them. The OM, ${loginFor("OM")}, has no notifications.`,
  },
]
