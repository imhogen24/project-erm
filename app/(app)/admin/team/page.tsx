import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { projectsNeedingTeam } from "@/server/staff/team"

import { roleNames, trackName } from "./names"

const square = "grid-square relative isolate bg-background"

export default async function Page() {
  const session = await requireSession()

  if (!(await isItAdmin(session.user.id))) {
    redirect("/")
  }

  const needing = await projectsNeedingTeam(getDatabase(), session.user.id)

  return (
    <>
      <MobileBar className="xl:hidden" canInvite />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} current="team" canInvite />
        <main className="table-project table-home">
          <div
            className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-2 px-6 py-6`}
          >
            <Grain />
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Projects that need a team
            </h1>
            <p className="text-sm text-muted-foreground">
              These projects have no project manager or no onboarding manager
              yet. Newest first.
            </p>
          </div>
          <div className={`${square} mt-[var(--cell)] px-6 py-8`}>
            <Grain />
            {needing.length === 0 ? (
              <p className="relative text-muted-foreground">
                Every running project has a project manager and an onboarding
                manager.
              </p>
            ) : (
              <ul className="relative flex max-w-3xl flex-col">
                {needing.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-col gap-3 border border-foreground/20 p-4 not-first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {project.requestId}
                        </span>
                        <Badge variant="outline">
                          {trackName(project.serviceTrack)}
                        </Badge>
                      </div>
                      <span className="text-lg leading-snug font-medium break-words">
                        {project.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Missing:{" "}
                        {project.missing
                          .map((role) => roleNames[role])
                          .join(", ")}
                      </span>
                    </div>
                    <Button
                      asChild
                      size="lg"
                      className="h-12 w-full px-8 text-base sm:w-fit"
                    >
                      <Link href={`/admin/team/${project.id}`}>Assign</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
