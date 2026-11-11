import type { Role } from "@/db/schema"

import { loginFor } from "./seed-data/people"
import { SEED_PASSWORD } from "./seed-users"

const BASE = "http://localhost:3000"

// Each screen built so far, and how to see it. The issue that builds a screen
// adds its line here, so `bun run dev` always says who to log in as, where to
// go, and what should be there.
type Preview = {
  screen: string
  loginAs: Role
  // Someone other than the first person with the role, when the screen is on
  // a project that person is not on.
  email?: string
  path: (projectId: string) => string
  expect: string
}

const previews: Preview[] = [
  {
    screen: "Projects that need a team (IT/Admin)",
    loginAs: "IT/Admin",
    path: () => "/admin/team",
    expect:
      "Kofi Mensah sees three running projects short of a PM or an OM: Takoradi Port Conveyor Upgrade (nobody), Kumasi Cocoa Roasting Line (a PM only) and Accra Brewery Bottling Retrofit (an OM only), newest first. The rejected, closed, completed and fully staffed projects are not listed. Open one to assign people: Ama Owusu and Kojo Antwi are already at their limit of three projects. Assign staff in the sidebar has an orange count of 3, and on a narrow screen Team in the top bar has the same count (from RDP-127).",
  },
  {
    screen: "Every project as IT/Admin",
    loginAs: "IT/Admin",
    path: () => "/",
    expect:
      "All twelve projects, Tier 1 and Tier 3, active, on hold, rejected, closed and completed, each with the client's organisation. The IT/Admin holds no project role, so no project shows Your roles.",
  },
  {
    screen: "Project tree in the sidebar",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "On a wide screen, the left sidebar lists the 13 workbooks as folders (Onboarding (WB01), Contracting (WB02) and so on). Onboarding is open with its tools as links, each marked with its state. Click a tool to open it. The tree stays on the tool page, with the open tool highlighted. Each tool has a mark: grey dots when not started, orange dots moving clockwise while someone works on it, a solid orange square once locked, and a lock at the right that is open until the tool is locked. A tool that cannot open yet, because the one before it is not locked, is greyed out and is not a link; on the overview its tile says Opens after and the tool it waits on, and typing its address leads back to the overview.",
  },
  {
    screen: "D1.2 triage sheet (RDP-147)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect:
      "D1.2 is already approved, so the sheet is read only. The sheet shows the title block, the files, the three triage checks and the decision Proceed to D1.3. Press View client request for the web form, in tables, over half the screen.",
  },
  {
    screen: "D1.3 received request record (RDP-144)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect:
      "D1.3 on Tema Foods Boiler Skid is locked, so it reads as a finished sheet: Core Objectives and Scope, Input / Output Operands (M, E, I, L with Material, Energy, Information, Living thing under them), Operators and one missing item. Ho Water Treatment Dosing Skid has a D1.3 waiting for the PM. To fill in a D1.3 from empty, approve a D1.2 on another Tier 1 project.",
  },
  {
    screen: "Top bar over every tool: the project and the document control",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect:
      "Over the sheet, in its own box: a back arrow, the tool's title (the project name, tier and request ID are in the sidebar; on a phone they sit above the title) with its state badge, View client request at the right, with an Iteration badge beside the state, then the document control in one slim row under it (Prepared by, Checked by, Date checked, Date approved, Started, Completed): small grey labels over bold values, with the role (OM, PM) and the time taken as badges. The sheet below holds only the tool's tables. No sentence about the state is shown; the badge says it. Scroll on a wide screen: the bar stays put, level with the sidebar, and the sheet slides under it. On a phone the document control folds into a Document control row to tap. Every table title (Core Objectives and Scope, ...) is plain text on no fill, and the row of column names under it is hatched with bold text. On Tema Foods Boiler Skid, D1.3 is locked: Date checked and Date approved are both the approval time, and Iteration is 1. On Ho Water Treatment Dosing Skid, D1.3 waits for the PM: both dates are -, Iteration is 1. Iteration goes up each time someone other than the submitter moves a submitted record back to draft.",
  },
  {
    screen: "D1.4 acknowledgement email, as the OM (RDP-150)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.4`,
    expect:
      "D1.3 is locked, so D1.4 is open. Two boxes: 1.0 Dispatch metadata (Sent To is the client's email, grey; CC / BCC and Subject Line to type, the subject starting as Acknowledgement of Packaged boiler skid for the juice line request; Sent By already shows the OM's email, the IMHOGEN rep it comes from; Date Sent, Time Sent and Delivery Status say Filled in when the email is sent) and 2.0 Standard email template, the sheet's email with Dear Kwaku Ampofo, the submission date and the request ID filled in. There is no Save draft, Submit or Send: the OM prepares, and only the PM (ama.owusu@imhogen.test) sees Send. Edit the text and stop: the foot says Saving..., then ✓ Saved. Nothing is saved until you edit.",
  },
  {
    screen: "D1.4 acknowledgement email, as the PM: Send (RDP-150)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.4`,
    expect:
      "The same email, read only, with Send at the foot. Before the OM edits it, Send is off and says the Onboarding Manager has not started the email yet; with an empty subject or text it says what to add. Press Send: the email goes to the client through Resend when RESEND_API_KEY is set (the seeded clients have .test addresses, so nothing reaches anyone; without the key nothing leaves the machine), the email goes from the noreply address, the record locks, and Date Sent, Time Sent and Delivery Status Sent fill in, with Sent By kept as the OM, and D1.4 reads as Locked. Pressing twice sends once. A bad address in CC / BCC is refused and nothing is sent.",
  },
  {
    screen: "D1.1 client web form",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.1`,
    expect:
      "D1.1 is the client's web form, locked the moment it came in: the answers in tables (Contact, Project, Systems, Submission) and the attached files, read only. The OM, PM, CR and IT/Admin read it; nobody else sees it. The PM sees a change request on it from the OM: approve it and the client can edit and resend the form, which locks D1.1 again.",
  },
  {
    screen: "Client: start a new project",
    loginAs: "Client",
    email: "kwaku.ampofo@temafoods.test",
    path: () => "/",
    expect:
      "Kwaku Ampofo, a client, sees their projects, and the last square of the grid is Start new project with a plus. Press it, choose Tier 1 (Custom Engineering & Factory Solutions) or Tier 3 (Engineering Drafting & Digitization), and fill the same form as on the IMHOGEN website. Send request creates the project with D1.1 locked and opens it; it waits for the IT/Admin to assign a team. The form has no file upload yet.",
  },
  {
    screen: "Form tools on the same sheet (dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Plain fields sit together in a Details table (Field | Answer). Tables, checklists and read-only blocks each get their own titled box with the same ruled lines. Save draft and Submit for approval sit in the action row at the foot. The same boxes are used by every tool that is a form, such as D1.3 once D1.2 is approved.",
  },
  {
    screen: "Change requests on the project overview",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "Ama Owusu, the PM, sees Change requests waiting above the workbooks: Kwabena Asante (OM) asks to change D1.1 Client Email / Web Form because the client sent the boiler nameplate photo on 4 Nov. Approve or Reject sits beside it. The D1.1 tile below says Change requested.",
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
    screen: "Tier 3: Tarkwa Mine Pump Station Drawings",
    loginAs: "OM",
    email: "selorm.dzigbordi@imhogen.test",
    path: () => "/",
    expect:
      "Tarkwa Mine Pump Station Drawings shows Tier 3 on its tile. Open it: D1.1, D1.2 and T3.D1.3a T3 Technical Intake (Drafting) are locked, and D1.4 is open, its subject using the project name because the Tier 3 form has no title. No Tier 1 tool such as D1.3 is listed. Its PM, nana.adjei@imhogen.test, sends D1.4. Tema Foods Boiler Skid is the Tier 1 match.",
  },
  {
    screen: "PM: a D1.2 waiting for approval",
    loginAs: "PM",
    path: () => "/",
    expect:
      "Open Tamale Shea Butter Processing Plant, then D1.2. It is Submitted by Kwabena Asante (OM), with three files and all three checks Pass, deciding Proceed to D1.3. Approve sits in the action row at the foot. D1.1 on the same project is locked.",
  },
  {
    screen: "PM: a finished D1.3 to read",
    loginAs: "PM",
    path: () => "/",
    expect:
      "Open Cape Coast Hotel Laundry Boiler (on hold), then D1.3. It is Locked, prepared by Abena Frimpong (OM) and checked by Ama Owusu (PM), with every table filled: the laundry boiler's objectives, the four operands, the five operators and two missing items. Other PMs: efua.quartey@imhogen.test has D1.3 waiting on Ho Water Treatment Dosing Skid, nana.adjei@imhogen.test has D1.1 waiting on Sunyani Timber Kiln Controls.",
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect:
      "A bell at the top right of the sidebar header (on a narrow screen, in the top bar before Sign out) with the number 2 on it. Press it: newest first, D1.2 is waiting for your approval on Tamale Shea Butter Processing Plant, then A change to D1.1 is waiting for your decision on Tema Foods Boiler Skid, both with a dot for unread, then older read notes: tools locked two days ago and the projects Ama was added to. Click one: you go to its page and the number drops by 1. Press Mark all read: the number and the dots go. Log in as the OM, kwabena.asante@imhogen.test, to see the empty message: You have no notifications. Notifications cannot be deleted, so once read they stay read.",
  },
]

// Printed on every start, so nobody has to ask who to log in as.
export function printPreviews(projectId: string | undefined) {
  if (!projectId) {
    return
  }

  console.log(`\nSee it in the browser: ${BASE}/sign-in`)
  console.log(`Password for everyone: ${SEED_PASSWORD}\n`)

  for (const preview of previews) {
    console.log(preview.screen)
    console.log(`  Log in as: ${preview.email ?? loginFor(preview.loginAs)}`)
    console.log(`  Visit:     ${BASE}${preview.path(projectId)}`)
    console.log(`  You see:   ${preview.expect}\n`)
  }
}
