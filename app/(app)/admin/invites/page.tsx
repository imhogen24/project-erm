import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { Grain } from "@/components/grain"
import { InviteForm } from "@/components/invite-form"
import { MobileBar } from "@/components/mobile-bar"
import { roles } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { listProjectsFor } from "@/server/projects/projects"

import { createInviteAction } from "./actions"

const square = "grid-square relative isolate bg-background"

export default async function Page() {
  const session = await requireSession()
  const projects = await listProjectsFor(getDatabase(), session.user.id)

  if (!isItAdmin(projects)) {
    redirect("/")
  }

  return (
    <>
      <MobileBar className="xl:hidden" canInvite />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} current="invites" canInvite />
        <main className="table-project table-home">
          <div
            className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-2 px-6 py-6`}
          >
            <Grain />
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Invite people
            </h1>
            <p className="text-sm text-muted-foreground">
              Give someone a role on a project. New people get a link to set
              their password.
            </p>
          </div>
          <div className={`${square} mt-[var(--cell)] px-6 py-8`}>
            <Grain />
            <div className="relative max-w-2xl">
              <InviteForm
                projects={projects.map(({ id, name }) => ({ id, name }))}
                roles={roles}
                create={createInviteAction}
              />
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
