import type { ProjectStatus } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { listProjectsFor } from "@/server/projects/projects"
import { projectsNeedingTeam } from "@/server/staff/team"

const running: readonly ProjectStatus[] = ["active", "on_hold"]

export type SidebarRow = {
  id: string
  name: string
  href: string
  tone: "open" | "active" | "quiet"
}

export type SidebarList = {
  title: string
  rows: SidebarRow[]
  more: { href: string; label: string }
}

// What the middle of the sidebar lists, outside a project. An IT/Admin sees the
// projects still short of a PM or an OM, each opening its assign page.
// Everyone else sees the running projects they are on.
export async function loadSidebarList(): Promise<SidebarList> {
  const session = await requireSession()
  const database = getDatabase()
  const admin = await isItAdmin(session.user.id)

  let title = "Running projects"
  let rows: SidebarRow[]
  let more = { href: "/", label: "All your projects" }

  if (admin) {
    const needing = await projectsNeedingTeam(database, session.user.id)

    title = "Need a team"
    more = { href: "/admin/team", label: "All projects that need a team" }
    rows = needing.map((project) => ({
      id: project.id,
      name: project.name,
      href: `/admin/team/${project.id}`,
      tone: "open",
    }))
  } else {
    const mine = await listProjectsFor(database, session.user.id)

    rows = mine
      .filter((project) => running.includes(project.status))
      .map((project) => ({
        id: project.id,
        name: project.name,
        href: `/projects/${project.id}`,
        tone: project.status === "on_hold" ? "quiet" : "active",
      }))
  }

  return { title, rows, more }
}
