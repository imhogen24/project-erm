import { CheckCircleIcon, CircleDashedIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Role } from "@/db/schema"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { projectsWaitingForTeam } from "@/lib/team"

import { roleNames, trackName } from "./names"

// The roles the list reports on, in the order it shows them.
const slots: readonly Role[] = ["PM", "OM", "FO"]

// One chip per role: filled when someone holds it, orange when nobody does.
// The sentence before them is for screen readers and says the same thing.
function TeamSlots({ missing }: { missing: Role[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="sr-only">
        Missing: {missing.map((role) => roleNames[role]).join(", ")}
      </span>
      <ul aria-hidden className="flex flex-wrap gap-2">
        {slots.map((role) => {
          const open = missing.includes(role)

          return (
            <li
              key={role}
              title={
                open ? `No ${roleNames[role]} yet` : `Has a ${roleNames[role]}`
              }
              data-open={open}
              className="status-chip"
            >
              {open ? (
                <CircleDashedIcon className="size-4" />
              ) : (
                <CheckCircleIcon weight="fill" className="size-4" />
              )}
              {roleNames[role]}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default async function Page() {
  const session = await requireSession()

  if (!(await isItAdmin(session.user.id))) {
    redirect("/")
  }

  // The same read as the sidebar's count, once per request, so the list and
  // the count always agree.
  const needing = await projectsWaitingForTeam(session.user.id)

  return (
    <>
      <MobileBar className="xl:hidden" canInvite />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} current="team" canInvite />
        <main className="table-project table-home">
          <PageSheet
            title={"Projects that need a team"}
            below={
              <>
                <p className="text-sm text-muted-foreground">
                  These projects have no project manager or no onboarding
                  manager yet. Newest first.
                </p>
              </>
            }
          >
            {needing.length === 0 ? (
              <p className="relative text-muted-foreground">
                Every running project has a project manager and an onboarding
                manager.
              </p>
            ) : (
              <ul className="relative grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {needing.map((project) => (
                  <li
                    key={project.id}
                    className="tile link-tile relative flex flex-col justify-between gap-6"
                  >
                    <Link
                      href={`/admin/team/${project.id}`}
                      aria-hidden
                      tabIndex={-1}
                      className="tile-cover"
                    />
                    <div className="flex min-w-0 flex-col gap-2">
                      <span className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
                        {project.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary">
                          {trackName(project.serviceTrack)}
                        </Badge>
                        <span className="tabular-nums">
                          {project.requestId}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <TeamSlots missing={project.missing} />
                      <Button
                        asChild
                        size="lg"
                        className="above-stretch h-11 w-full px-6 text-base sm:w-fit sm:self-end"
                      >
                        <Link href={`/admin/team/${project.id}`}>Assign</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PageSheet>
        </main>
      </div>
    </>
  )
}
