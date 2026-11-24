import type { Role } from "@/db/schema"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { loginFor, staffWith } from "./seed-data/people"
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
    expect: `On ${fillIn}: 1.0 has Meeting Date and Meeting Time to choose; Reference Request ID, Lead Engineer (Handing Off), Contract Admin (Receiving), Project/Client Name and Project Value (GHS), D1.15's budget total, are the system's. 2.0: Reference Document with View, which opens D1.15 Project Brief & Draft Budget as a PDF in a panel from the right while you stay on D1.16; Scope Summary to write; Payment Terms Agreed starts from D1.15's payment schedules. 3.0: Scope Exclusion, Timeline Risk and Financial Risk locked in place, each with its source (D1.13, D1.11, D1.15) and a directive to write; Add row for more. 4.0: the three checklist tasks with their assignees and a Pending / Done status. Sign Engineering Release and submit. On the Tier 3 projects the value is T3.D1.15a's total and View opens T3.D1.15a T3 Drafting SOW & Quote.`,
  },
  {
    screen: "D1.16 approval, as the PM",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.16`,
    expect: `On ${approve}: the LE's minutes, read only, with Sign on Contracting Acceptance, then Approve and Send back. Approving locks it, which closes Workbook 1. On ${approved} it reads locked. The OM, CA, HE and IT/Admin read it; the client does not see it.`,
  },
  {
    screen: "D2.1 standard contract template, as the CA (RDP-161)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.1`,
    expect: `On ${approved}, where D1.16 is locked, D2.1 is open. 1.0 starts filled in and can be changed: Last Legal Review Date is today, Reviewed By is the project's PM (${staffWith("PM").name}), Governing Jurisdiction Ghana, Default Currency GHS. 2.0: type 40 in Payable upon Execution (%). The table lists the sheet's eight clauses, SN 2.1 to 2.8, each with a padlock: their category and text cannot be changed or removed, only Status (Active / Archived). Clause 2.1 names ${client.organisation}, and 2.3 reads the total sum of GHS 94,400.00 as follows: 40% upon execution, following what you typed. Add row gives a row numbered 2.9 with Status Active and a bin to remove it; fill in its category and text. 3.0: Appendix A (D1.15), B (D1.13), C (D1.11) and D (the stored SLA PDF) each have View, which opens the PDF beside the sheet. Press Submit (there is no approver): it says Submitted and locked, and D2.1 reads Locked with Request a change. The PM, HE and IT/Admin read it without editing; the OM and the client do not see it. ${DEV_LOCKED} (Tier 1) and (Tier 3) have it locked with sample clauses, and Export PDF shows the filled-in clauses.`,
  },
  {
    screen: "D2.2 initial draft contract, as the CA (RDP-164)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.2`,
    expect: `On ${DEV_LOCKED} (Tier 1), where D2.1 is locked, D2.2 is open. 1.0: Drafted By and Date of Initial Draft say Filled in when D2.2 is submitted; Assigned Project Manager is ${staffWith("PM").name}, Project/Client Name names the project and ${client.organisation}, Overall Project Value is GHS 94,400.00, and Reference Hand-off (D1.16) has View. 2.0 starts filled in and can be changed: Client Legal Entity Name ${client.organisation}, Primary Client Signatory ${client.name}, Total Contract Value GHS 94,400.00, Project Duration 8 weeks. 3.0 Payment Schedule 1 starts as D1.15's 40% at Contract Signing, 60% at Handover, 4.0 Phase 1 as 1 week, and the rows D1.15 has nothing for start empty. 5.0 Phase 1 reads D1.15's key deliverables with a padlock; Phases 2 and 3 read —. Every Source Reference shows the tool (D1.3 or D1.15) with View, which opens its PDF beside the sheet (D1.3 says Not started on the Dev projects, which have no D1.3). Each table has Add row: the new row gets the next SN (2.5, 3.4 ...), a bin, and no source; the sheet's rows have no bin. 6.0 has Scope Exclusion, Timeline Risk and Financial Risk to write a clause for; 7.0's notes show the sheet's hints. Choose No in Ready for PM Review and press Submit: it is refused with Answer Yes once the draft is ready for the PM's review. Answer both Yes, choose Attached or Missing for each appendix, press Sign on Contract Admin Signature and Submit: it says Submitted and locked, Drafted By is you and both dates are today, with Request a change at the foot. The PM and the CR read it without editing, and its Views still open; the OM, the HE and the client do not see it.`,
  },
  {
    screen: "Every tool built, locked or open",
    loginAs: "OM",
    path: () => "/",
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have every tool built locked with sample answers, except D2.2, open on Tier 1 for the CA to fill in: open any tool as any role to see what that role reads. ${DEV_UNLOCKED} (Tier 1) and (Tier 3) have every tool of their tier open at once, empty, without waiting for the one before (development only, never in production): the client's web form is a draft the client can change, and every other tool starts from nothing. A tool that reads an earlier one, such as D1.6 reading D1.5's agreed time, says what it is missing until that one is filled in. D1.4 is sent by the PM: the OM prepares the email, the PM presses Send, and the D1.4 tile shows a Sent chip that turns Delivered once the Inngest dev server runs the delivery check.`,
  },
  {
    screen: "Unpicking a chosen option (RDP-154)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), D1.2: press Reject as Spam, then press it again: neither decision is chosen. Press Proceed, then Reject: it switches in one press. With neither chosen, Submit for approval says Choose a triage decision to submit, and nothing is sent. Save draft with neither chosen and reload: still neither. Tab to a chosen decision and press Space: it lets go. Pass and Fail in the checks, Yes and No answers and every other one-of-a-few choice let go the same way.`,
  },
  {
    screen: "Sending D1.2 back (RDP-157)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), log in as the OM, ${loginFor("OM")}, fill in D1.2 and press Submit for approval. Then, as the PM, ${loginFor("PM")}, the submitted D1.2 has Send back beside Approve. Send back opens What needs changing?; Send back to the writer stays off until a reason is typed, then says Sent back to the writer. As the OM again, D1.2 is editable with Sent back for changes and the PM's reason at the top. Change it and submit again: the PM sees Approve and Send back once more.`,
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
      "Plain fields sit together in a Details table (Field | Answer). Tables, checklists and read-only blocks each get their own titled box with the same ruled lines. Save draft and Submit for approval sit in the action row at the foot. The same boxes are used by every tool that is a form, such as D1.3 once D1.2 is approved.",
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
    screen: "The client changed their request (RDP-155)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.1`,
    expect: `On ${DEV_LOCKED} (Tier 1): as the OM, ${loginFor("OM")}, ask for a change to D1.1 on the project overview; as the PM, approve it. As the client, ${client.email}, open D1.1, change Title and Timeline, add or take off a file (needs UPLOADTHING_TOKEN to add), and press Send the changes. The PM and the OM each get a bell note, The client changed their request on ${DEV_LOCKED} (Tier 1); clicking it opens D1.1. There Title and Timeline are tinted, each with Was: and the old answer under it; the rest read as before; Changed files lists each file as Added or Removed. The tint stays until the next change request on D1.1 is approved.`,
  },
  {
    screen: "Withdraw a submitted tool, as the OM (RDP-152)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), fill in D1.3 and press Submit for approval. Withdraw appears at the foot of the sheet. Press it: it asks Take this back to fix it? Press Yes, withdraw: D1.3 is a draft again with Save draft and Submit for approval, and the Iteration stays the same. The PM, ${loginFor("PM")}, sees no Withdraw on a D1.3 the OM submitted, and after a withdraw their waiting for approval note is read. D1.2 offers the same Withdraw once submitted.`,
  },
  {
    screen: "Request a change from a locked tool, as the OM (RDP-152)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.3 is locked and shows Request a change at the foot of the sheet, and no Withdraw. Press it, give a reason and Send request: the button goes and Change requested shows next to the Locked badge. The PM decides it on the project page.`,
  },
  {
    screen: "Iteration after a change request (RDP-156)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.3's top bar shows Iteration 1. Press Request a change and send it. The PM, ${loginFor("PM")}, approves it on the project page. Back on D1.3 the OM edits and submits, and the PM approves: the top bar now shows Iteration 2. A send back and resubmit still raises it by 1 as before; a withdraw does not.`,
  },
  {
    screen: "Comments on a tool (RDP-158)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.2 ends with a Comments box: the PM's question with the OM's reply indented under it, each with the name, role in full and time, and Reply and Resolve; under it a folded "Resolved by" thread that opens when pressed; then Add a comment. Write a comment and press Comment: the OM, ${loginFor("OM")}, gets a New comment on D1.2 notification that opens D1.2 at the comment. Their reply gives the PM a New reply notification. Every tool, locked or not, has the box; the client never sees it.`,
  },
  {
    screen: "Every tool saves by itself (RDP-153)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), D1.2 has no Save draft, only Submit for approval. Type a reviewer note: a moment later the foot says Saving… then ✓ Saved. Click Project overview and come back: the note is there. Type and click away at once: it saves on the way and goes. With the network off (browser dev tools, Offline), typing shows Not saved. Retrying…, and clicking a link asks Your latest changes are not saved yet. Leave anyway? with Leave and Stay; back online it saves by itself. Every other tool, D1.5 and D1.6 among them, saves the same way.`,
  },
  {
    screen: "Export a tool as a PDF (RDP-162)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.14`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.14's top bar has Export PDF at the right. Press it: a file named D1.14 Cost Estimation Sheet - Dev- Every Tool Locked (Tier 1).pdf downloads (a colon or slash in a name becomes -). It starts with the tool's ID and name, the project and Locked, then the document control (request ID, prepared by, checked by, dates, iteration). Each section follows with the sheet's own title and order: fields as label and answer, tables as tables whose long text wraps, the totals the sheet works out, signatures as who signed and when, files by name, and — for an empty answer. Every page is A4 with Page 1 of N at the foot. Every tool with a record has the button, a draft too (try any tool on ${DEV_UNLOCKED} (Tier 1) once something is typed). A tool with no record has none, and the client gets none on a tool IMHOGEN shares only once it is approved.`,
  },
  {
    screen: "PDF preview field (RDP-163, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect: `Near the foot, the Appendices box has three rows. Appendix A: D1.15 Project Brief & Draft Budget has View: press it and a panel slides in from the right (half the screen on a wide one, all of it on a phone) with ${DEV_LOCKED} (Tier 1)'s D1.15 as a PDF that scrolls through every page, then Download (saves the file) and Open (a new tab). Appendix B has View greyed and says Not started; Appendix C has View greyed and says No access. Log in as the HE, ${loginFor("HE")}, who may not read D1.15: Appendix A says No access too, and its address, /api/projects/<project id>/tools/D1.15/pdf, answers not found. D2.1's appendices use the same field once that tool is built.`,
  },
  {
    screen: "PDF preview field on a Tier 3 project (RDP-181, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview?tier=3",
    expect: `The preview reads ${DEV_LOCKED} (Tier 3). Appendix A still names D1.15 in its label, but View opens a panel headed T3.D1.15a T3 Drafting SOW & Quote, the tool Tier 3 uses in its place, with T3.D1.15a's record as a PDF; Download saves a file named after T3.D1.15a. Its address, /api/projects/<project id>/tools/T3.D1.15a/pdf, gives the PDF, and so does the D1.15 address on this project; on ${DEV_LOCKED} (Tier 1) the T3.D1.15a address answers not found. Without ?tier=3 the page shows D1.15 exactly as before. Log in as the HE, ${loginFor("HE")}, who may not read T3.D1.15a: Appendix A says No access.`,
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect: `A bell at the top right of the sidebar header (on a narrow screen, in the top bar) with a number on it: one unread note for each project where ${CURRENT_TOOL} waits for the ${approver}'s approval, and one for the change waiting on ${approved}, then older read notes. Click one: you go to its page and the number drops by 1. Mark all read clears them. The OM, ${loginFor("OM")}, has no notifications.`,
  },
]
