import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { InviteForm } from "@/components/invite-form"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { roles } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { listProjectsFor } from "@/server/projects/projects"

import { createInviteAction } from "./actions"

export default async function Page() {
  const session = await requireSession()

  if (!(await isItAdmin(session.user.id))) {
    redirect("/")
  }

  const projects = await listProjectsFor(getDatabase(), session.user.id)

  return (
    <>
      <MobileBar className="xl:hidden" canInvite />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} current="invites" canInvite />
        <main className="table-project table-home">
          <PageSheet
            title={"Invite people"}
            below={
              <>
                <p className="text-sm text-muted-foreground">
                  Give someone a role on a project, or the roles they can be
                  assigned. New people get a link to set their password.
                </p>
              </>
            }
          >
            <div className="relative">
              <InviteForm
                projects={projects.map(
                  ({ id, name, requestId, serviceTrack }) => ({
                    id,
                    name,
                    requestId,
                    tier: serviceTrack === "Tier_1" ? "T1" : "T3",
                  })
                )}
                roles={roles}
                create={createInviteAction}
              />
            </div>
          </PageSheet>
        </main>
      </div>
    </>
  )
}
