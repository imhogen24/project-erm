import { ArrowUpRightIcon, PlusIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { PageSheet } from "@/components/page-sheet"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { isClientAccount } from "@/server/intake/client-requests"
import { listProjectsFor } from "@/server/projects/projects"

// Every box is a whole number of grid squares: the title is 2 squares tall and
// each project is 4 wide and 2 tall, sharing its lines with its neighbours.
const square = "grid-square relative isolate bg-background"

export default async function Page() {
  const session = await requireSession()

  const [projects, canInvite, client] = await Promise.all([
    listProjectsFor(getDatabase(), session.user.id),
    isItAdmin(session.user.id),
    isClientAccount(getDatabase(), session.user.id),
  ])

  // A client starts their own projects from the last square of the grid.
  const start = client ? (
    <li className={`${square} min-w-0`}>
      <Grain />
      <Link
        href="/projects/new"
        className="group flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground transition-colors outline-none hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/10"
      >
        <span className="flex size-12 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-tile)] transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <PlusIcon aria-hidden className="size-6" />
        </span>
        <span className="text-lg text-foreground">Start new project</span>
      </Link>
    </li>
  ) : null

  const empty = projects.length === 0 && !client

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--inset)]">
        <AppSidebar name={session.user.name} canInvite={canInvite} />
        <main className="table-project table-home">
          <PageSheet
            title="Your projects"
            below={
              <p className="text-sm text-muted-foreground">
                {projects.length === 1
                  ? "1 project"
                  : `${projects.length} projects`}
              </p>
            }
            flush={!empty}
          >
            {empty ? (
              <p className="text-muted-foreground">
                You are not on any project yet.
              </p>
            ) : (
              <ul className="grid flex-1 auto-rows-[minmax(calc(var(--cell)*2),1fr)] grid-cols-[repeat(auto-fill,minmax(calc(var(--cell)*4),1fr))]">
                {projects.map((project) => (
                  <li key={project.id} className={`${square} min-w-0`}>
                    <Grain />
                    <Link
                      href={`/projects/${project.id}`}
                      className="group block h-full outline-none focus-visible:bg-primary/10"
                    >
                      <Card className="h-full justify-between rounded-none border-0 bg-transparent py-0 shadow-none ring-0 transition-colors group-hover:bg-primary/5">
                        <CardHeader className="gap-2 px-6 pt-6">
                          <CardTitle className="text-lg leading-snug break-words">
                            {project.name}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {project.serviceTrack.replace("_", " ")}
                            </Badge>
                            <p className="text-sm text-muted-foreground">
                              Your roles: {project.roles.join(", ")}
                            </p>
                          </div>
                        </CardHeader>
                        <div className="flex justify-end px-6 pb-6 text-muted-foreground transition-colors group-hover:text-primary">
                          <ArrowUpRightIcon className="size-5" />
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
                {start}
              </ul>
            )}
          </PageSheet>
        </main>
      </div>
    </>
  )
}
