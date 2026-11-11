import type { ReactNode } from "react"

import { BackLink } from "@/components/back-link"
import { StateBadge } from "@/components/state-badge"
import type { ToolState } from "@/lib/tool-state"

// The top of a sheet, like the title block of a drawing: where it came from, the
// tool and where it stands, then the document control facts in ruled cells.
export function SheetTitleBlock({
  backHref,
  backLabel,
  title,
  state,
  statusLine,
  facts,
  action,
  badges,
}: {
  backHref: string
  backLabel: string
  title: string
  state: ToolState
  // A line about the state, left out when there is nothing useful to say.
  statusLine?: string
  facts: { label: string; value: string }[]
  // A button for the sheet, such as the one that opens the client request.
  action?: ReactNode
  // Chips beside the state, such as D1.4's delivery status.
  badges?: ReactNode
}) {
  return (
    <header className="relative flex flex-col">
      <BackLink href={backHref} className="border-b">
        {backLabel}
      </BackLink>
      <div className="flex flex-col gap-4 px-6 pt-8 pb-6 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StateBadge state={state} />
            {badges}
            {statusLine && (
              <p className="text-sm text-muted-foreground">{statusLine}</p>
            )}
          </div>
        </div>
        {action && <div className="flex shrink-0">{action}</div>}
      </div>
      {facts.length > 0 && (
        <section aria-label="Document control">
          <dl className="grid grid-cols-2 gap-px border-y border-foreground/20 bg-foreground/20 @2xl:grid-cols-3">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="flex min-w-0 flex-col gap-0.5 bg-background px-6 py-3"
              >
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="text-sm font-medium break-words">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </header>
  )
}
