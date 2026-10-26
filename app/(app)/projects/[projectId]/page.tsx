import { notFound } from "next/navigation"
import { z } from "zod"

import { AppSidebar } from "@/components/app-sidebar"
import { BackLink } from "@/components/back-link"
import { DecideChange } from "@/components/decide-change"
import { Grain } from "@/components/grain"
import { MobileBar } from "@/components/mobile-bar"
import { RequestChange } from "@/components/request-change"
import { StateBadge, stateFrame, stateSquare } from "@/components/state-badge"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { isItAdmin } from "@/lib/roles"
import { requireSession } from "@/lib/session"
import { registeredTools } from "@/lib/tools"
import { changeControlsFor } from "@/server/change-requests/controls"
import { getDatabase } from "@/server/database"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { getProjectOverview } from "@/server/projects/projects"

import { decideChangeAction, requestChangeAction } from "./actions"

// Every box is a whole number of grid squares and shares its lines.
const square = "grid-square relative isolate bg-background"

// "wb01" is shown as "Workbook 1", with the figure 1 drawn large beside it.
function workbookNumber(workbook: string) {
  return /^wb0*(\d+)$/.exec(workbook)?.[1]
}

function workbookTitle(workbook: string) {
  const number = workbookNumber(workbook)

  return number ? `Workbook ${number}` : workbook
}

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const session = await requireSession()

  // An id that cannot be a project looks the same as one that is not found.
  if (!z.uuid().safeParse(projectId).success) {
    notFound()
  }

  let overview

  try {
    overview = await getProjectOverview(
      getDatabase(),
      session.user.id,
      projectId,
      registeredTools
    )
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      notFound()
    }

    throw error
  }

  // Only to decide whether the top bar offers the invite page.
  const canInvite = await isItAdmin(session.user.id)

  const controls = await changeControlsFor(
    getDatabase(),
    session.user.id,
    projectId
  )

  const controlOf = new Map(
    controls.records.map((control) => [control.toolId, control])
  )

  const workbooks = new Map<string, typeof overview.tools>()

  for (const tool of overview.tools) {
    workbooks.set(tool.workbook, [
      ...(workbooks.get(tool.workbook) ?? []),
      tool,
    ])
  }

  return (
    <>
      <MobileBar className="xl:hidden" canInvite={canInvite} />
      <div className="drafting-grid min-h-svh py-[var(--cell)]">
        <AppSidebar
          name={session.user.name}
          project={{
            name: overview.name,
            workbooks: [...workbooks.keys()].map((workbook) => ({
              id: workbook,
              label: workbookTitle(workbook),
            })),
          }}
        />
        <main className="table-project table-home">
          <div>
            <div
              className={`${square} flex min-h-[calc(var(--cell)*2)] flex-col justify-end gap-3 px-6 py-6`}
            >
              <Grain />
              <BackLink
                href="/"
                className="-mx-6 -mt-6 mb-auto border-b xl:hidden"
              >
                Your projects
              </BackLink>
              <h1 className="text-4xl font-semibold tracking-tight break-words sm:text-5xl">
                {overview.name}
              </h1>
            </div>
          </div>
          {controls.waiting.length > 0 && (
            <section
              aria-label="Change requests waiting"
              className="mt-[var(--cell)]"
            >
              <div className={`${square} px-6 py-6`}>
                <Grain />
                <div className="relative flex max-w-3xl flex-col gap-4">
                  <h2 className="text-lg font-medium">
                    Change requests waiting
                  </h2>
                  <ul className="flex flex-col">
                    {controls.waiting.map((request) => (
                      <li
                        key={request.id}
                        className="flex flex-col gap-3 border border-foreground/20 p-4 not-first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-medium break-words">
                            {`${request.toolId} ${request.toolName}`}
                          </span>
                          <span className="text-sm break-words">
                            {request.reason}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Asked by {request.requestedBy}
                          </span>
                        </div>
                        <DecideChange
                          requestId={request.id}
                          decide={decideChangeAction}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}
          {[...workbooks].map(([workbook, tools]) => (
            <section
              key={workbook}
              id={workbook}
              className="mt-[var(--cell)] scroll-mt-[var(--cell)]"
            >
              <div className="grid grid-cols-[repeat(auto-fill,calc(var(--cell)*4))]">
                <div
                  className={`${square} flex h-[calc(var(--cell)*2)] items-end justify-between px-6 py-6 md:flex-col md:items-start`}
                >
                  <Grain />
                  <h2 className="text-lg font-medium">
                    {workbookTitle(workbook)}
                  </h2>
                  <span
                    aria-hidden
                    className="outline-numeral font-mono text-6xl leading-none font-bold md:text-8xl"
                  >
                    {workbookNumber(workbook)}
                  </span>
                </div>
                <ul className="contents">
                  {tools.map((tool) => (
                    <li
                      key={tool.toolId}
                      className={cn(
                        "grid-square relative isolate flex h-[calc(var(--cell)*2)] min-w-0 flex-col justify-between gap-4 p-6",
                        stateSquare(tool.state)
                      )}
                    >
                      <Grain />
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-3",
                          stateFrame(tool.state)
                        )}
                      />
                      <div className="relative flex min-w-0 flex-col gap-1 px-1">
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {tool.toolId}
                        </span>
                        <span className="text-sm leading-snug break-words">
                          {tool.name}
                        </span>
                      </div>
                      <div className="relative flex flex-wrap items-center justify-between gap-2 px-1">
                        <StateBadge state={tool.state} />
                        {controlOf.get(tool.toolId)?.request && (
                          <Badge
                            variant="outline"
                            className="rounded-none border-current bg-transparent text-inherit dark:bg-transparent"
                          >
                            {controlOf.get(tool.toolId)?.request?.status ===
                            "approved"
                              ? "Change approved"
                              : "Change requested"}
                          </Badge>
                        )}
                        {controlOf.get(tool.toolId)?.canRequest && (
                          <RequestChange
                            recordId={controlOf.get(tool.toolId)!.recordId}
                            request={requestChangeAction}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </main>
      </div>
    </>
  )
}
