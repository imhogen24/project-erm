import { requireSession } from "@/lib/session"
import { projectsWaitingForTeam } from "@/lib/team"
import { waitingSuffix } from "@/lib/waiting-suffix"

// A Server Component for inside the Assign staff and Team links: " (3)", or
// nothing at zero. Put it only in a link an IT/Admin sees.
export async function TeamWaiting() {
  const session = await requireSession()
  const waiting = await projectsWaitingForTeam(session.user.id)

  return <>{waitingSuffix(waiting)}</>
}
