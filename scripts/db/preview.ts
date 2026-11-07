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
      "One sheet: the title block with the project, request ID and people, then tables for the files (open a file, describe it), the three triage checks (Pass | Fail and notes) and the decision. Proceed turns off while a check is Fail. Press View client request for the web form, in tables, over half the screen. Log in as pm@example.com to see it read only with Approve.",
  },
  {
    screen: "D1.1 review sheet",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.1`,
    expect:
      "The same sheet as D1.2: request status and the attached files as tables, with Pending | Reviewed, read only because the demo D1.1 is locked.",
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect:
      "A bell at the top right of the sidebar header (on a narrow screen, in the top bar before Sign out) with the number 3 on it. Press it: a panel lists 4 notifications, newest first, each with its title and how long ago (5 minutes ago, 3 hours ago, Yesterday, 3 days ago). The first 3 have a dot for unread. Click one: you go to its page and the number drops by 1. Press Mark all read: the number and the dots go. Log in as another demo user, for example om@example.com, to see the empty message: You have no notifications. Notifications cannot be deleted, so once read they stay read.",
  },
  {
    screen: "Requests waiting for a team (RDP-127)",
    loginAs: "IT/Admin",
    path: () => "/admin/team",
    expect:
      "In the left sidebar the link reads Assign staff (2): the number of requests with no PM or no OM, the same as the list on the page. (On a narrow screen the top bar says Team (2).) Give one of the two Waiting Projects both a PM and an OM and go back: the number drops by 1. At 0 the link is just Assign staff, with no brackets. Log in as pm@example.com: there is no Assign staff link.",
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
