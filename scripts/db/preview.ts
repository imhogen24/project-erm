import type { Role } from "@/db/schema"

import { SEED_PASSWORD, seedEmail } from "./seed-users"

const BASE = "http://localhost:3000"

// Each screen built so far, and how to see it. The issue that builds a screen
// adds its line here, so `bun run dev` always says who to log in as, where to
// go, and what should be there.
type Preview = {
  screen: string
  loginAs: Role
  path: (projectId: string) => string
  expect: string
}

const previews: Preview[] = [
  {
    screen: "Project tree in the sidebar",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "On a wide screen, the left sidebar lists the 13 workbooks as folders (Onboarding (WB01), Contracting (WB02) and so on). Onboarding is open with its tools as links, each marked with its state. Click a tool to open it. The tree stays on the tool page, with the open tool highlighted. Each tool has a mark: grey dots when not started, orange dots moving clockwise while someone works on it, a solid orange square once locked, and a lock at the right that is open until the tool is locked.",
  },
  {
    screen: "D1.2 triage sheet (RDP-147)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect:
      "The demo D1.2 is already approved, so the sheet is read only and D1.3 is open on the project page. The sheet shows the title block, the files, the three triage checks and the decision Proceed to D1.3. Press View client request for the web form, in tables, over half the screen.",
  },
  {
    screen: "D1.3 received request record (RDP-144)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect:
      "Demo Project is Tier 1 and D1.2 is already approved, so D1.3 is open. Four tables: Core Objectives and Scope has 3 locked rows (lock, no Remove) and Add row; Input / Output Operands (M, E, I, L) and Operators (5 rows) are fixed; Identified Missing Information is empty with Add row. Save draft keeps a half-filled sheet. Submit needs the description of the first two core objectives. The Tier 3 sheet, T3.D1.3a, opens only on a Tier 3 project.",
  },
  {
    screen: "D1.1 review sheet",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.1`,
    expect:
      "The same sheet as D1.2: request status and the attached files as tables, with Pending | Reviewed, read only because the demo D1.1 is locked.",
  },
  {
    screen: "Form tools on the same sheet (dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Plain fields sit together in a Details table (Field | Answer). Tables, checklists and read-only blocks each get their own titled box with the same ruled lines. Save draft and Submit sit in the action row at the foot. The same boxes are used by every tool that is a form, such as D1.3 once D1.2 is approved.",
  },
  {
    screen: "Change requests on the project overview",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "When a change request is waiting, it shows in a titled, ruled box above the workbooks, like the tables on a tool sheet.",
  },
  {
    screen: "Tables with locked and added rows (RDP-144, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Find the table Locked and added rows. Its two rows, Primary purpose and Main deliverables, show a lock and have no Remove button. Press Add row: a third row opens with an editable name and a Remove button. D1.3 and T3.D1.3a use this table for their own tables once the OM can open them.",
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect:
      "A bell at the top right of the sidebar header (on a narrow screen, in the top bar before Sign out) with the number 3 on it. Press it: a panel lists 4 notifications, newest first, each with its title and how long ago (5 minutes ago, 3 hours ago, Yesterday, 3 days ago). The first 3 have a dot for unread. Click one: you go to its page and the number drops by 1. Press Mark all read: the number and the dots go. Log in as another demo user, for example om@example.com, to see the empty message: You have no notifications. Notifications cannot be deleted, so once read they stay read.",
  },
]

// Printed on every start, so nobody has to ask who to log in as.
export function printPreviews(projectId: string | undefined) {
  if (!projectId) {
    return
  }

  console.log(`\nSee it in the browser: ${BASE}/sign-in`)
  console.log(`Password for every demo user: ${SEED_PASSWORD}\n`)

  for (const preview of previews) {
    console.log(preview.screen)
    console.log(`  Log in as: ${seedEmail(preview.loginAs)}`)
    console.log(`  Visit:     ${BASE}${preview.path(projectId)}`)
    console.log(`  You see:   ${preview.expect}\n`)
  }
}
