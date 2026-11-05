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
      "On a wide screen, the left sidebar lists the 13 workbooks as folders (Onboarding (WB01), Contracting (WB02) and so on). Onboarding is open with its tools as links, each marked with its state. Click a tool to open it. The tree stays on the tool page, with the open tool highlighted.",
  },
  {
    screen: "D1.2 triage screen (RDP-147)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect:
      "Request details (source Web Form, 3 Nov 2026 09:14 UTC, sender client@example.com), then two files with Open file and a description box, three triage checks (Pass/Fail and notes), and the two decision buttons. Proceed turns off while a check is Fail. Save draft, then Submit for approval. Log in as pm@example.com afterwards to see it read only with Approve.",
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
