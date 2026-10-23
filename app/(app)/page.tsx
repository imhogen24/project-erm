import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/session"
import { getDatabase } from "@/server/database"
import { listProjectsFor } from "@/server/projects/projects"

// Every box is a whole number of grid squares: the title is 2 squares tall and
// each project is 4 wide and 2 tall, sharing its lines with its neighbours.
const square = "grid-square relative isolate bg-background"

export default async function Page() {
  const session = await requireSession()
  const projects = await listProjectsFor(getDatabase(), session.user.id)

  return (
    <>
      <MobileBar className="xl:hidden" />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar name={session.user.name} />
        <main className="table-project table-home">
          <div>
            <div
              className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-2 px-6 py-6`}
            >
              <Grain />
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Your projects
              </h1>
              <p className="text-sm text-muted-foreground">
                {projects.length === 1
                  ? "1 project"
                  : `${projects.length} projects`}
              </p>
            </div>
            {projects.length === 0 ? (
              <p className={`${square} px-6 py-6 text-muted-foreground`}>
                You are not on any project yet.
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,calc(var(--cell)*4))]">
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className={`${square} h-[calc(var(--cell)*2)] min-w-0`}
                  >
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
                          <p className="text-sm text-muted-foreground">
                            Your roles: {project.roles.join(", ")}
                          </p>
                        </CardHeader>
                        <div className="flex justify-end px-6 pb-6 text-muted-foreground transition-colors group-hover:text-primary">
                          <ArrowUpRightIcon className="size-5" />
                        </div>
                      </Card>
                    </Link>
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
