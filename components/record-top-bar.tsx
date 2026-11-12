import type { ReactNode } from "react"
import { ArrowLeftIcon, CaretDownIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { Grain } from "@/components/grain"
import { StateBadge } from "@/components/state-badge"
import { Badge } from "@/components/ui/badge"
import type { ToolState } from "@/lib/tool-state"

// One fact of the document control: the value, a short tag beside it as a
// badge (a role, a count, a duration), or both.
export type Fact = { label: string; value?: string; badge?: string }

function FactValue({ fact }: { fact: Fact }) {
  return (
    <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
      {fact.value && (
        <span className="text-sm font-medium whitespace-nowrap">
          {fact.value}
        </span>
      )}
      {fact.badge && (
        <Badge variant="secondary" className="tabular-nums">
          {fact.badge}
        </Badge>
      )}
    </dd>
  )
}

function BackCell({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Project overview"
      className="group flex w-12 shrink-0 items-center justify-center border-r text-muted-foreground transition-colors outline-none hover:bg-primary/5 hover:text-foreground focus-visible:bg-primary/10"
    >
      <ArrowLeftIcon
        weight="bold"
        className="size-4 transition-transform group-hover:-translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
      />
    </Link>
  )
}

// The bar over a tool's sheet: the tool's name and state, then
// the record's document control in one row, kept in view. The sheet below
// holds only the tool's tables. Narrow, the facts fold away behind a row to
// tap. The project's name, tier and request ID show only there: on a wide
// screen the sidebar shows them.
export function RecordTopBar({
  title,
  state,
  iteration,
  projectHref,
  projectName,
  tier,
  requestId,
  action,
  badges,
  control,
}: {
  // The tool, such as "D1.3 Received Request Record", and where it stands.
  title: string
  state: ToolState
  // 1, plus one for every rejection (document control).
  iteration?: number
  projectHref: string
  projectName: string
  tier?: string
  requestId?: string
  // A button about the project, such as the one that opens the client request.
  action?: ReactNode
  // Chips beside the state, such as D1.4's delivery status.
  badges?: ReactNode
  control: Fact[]
}) {
  return (
    <header
      aria-label="Document control"
      className="grid-square @container relative isolate bg-background"
    >
      <Grain />
      <div className="relative flex items-stretch">
        <BackCell href={projectHref} />
        <div className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground xl:hidden">
              <span className="font-normal break-words text-[var(--text-body)]">
                {projectName}
              </span>
              {tier && <Badge variant="secondary">{tier}</Badge>}
              {requestId && <span>{requestId}</span>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight break-words">
                {title}
              </h1>
              <StateBadge state={state} />
              {badges}
              {iteration !== undefined && (
                <Badge variant="outline" className="tabular-nums">
                  Iteration {iteration}
                </Badge>
              )}
            </div>
          </div>
          {action && <div className="flex shrink-0">{action}</div>}
        </div>
      </div>
      {/* Wide: every fact in one row, each as wide as its text, wrapping only
          when the row is full. The cells stay clear so the paper shows. */}
      <dl className="relative hidden flex-wrap overflow-hidden border-t xl:flex">
        {control.map((fact) => (
          <div
            key={fact.label}
            className="-mt-px -ml-px flex grow flex-col justify-center gap-1.5 border-t border-l border-[var(--border)] px-4 py-3"
          >
            <dt className="text-xs whitespace-nowrap text-muted-foreground">
              {fact.label}
            </dt>
            <FactValue fact={fact} />
          </div>
        ))}
      </dl>
      {/* Narrow: the facts behind a row to tap. */}
      <details className="group/control relative xl:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between border-t px-4 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:bg-primary/10 [&::-webkit-details-marker]:hidden">
          Document control
          <CaretDownIcon className="size-4 transition-transform group-open/control:rotate-180 motion-reduce:transition-none" />
        </summary>
        <dl className="flex flex-wrap overflow-hidden border-t">
          {control.map((fact) => (
            <div
              key={fact.label}
              className="-mt-px -ml-px flex min-w-[50%] grow flex-col gap-1.5 border-t border-l border-[var(--border)] px-4 py-2.5 sm:min-w-[25%]"
            >
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <FactValue fact={fact} />
            </div>
          ))}
        </dl>
      </details>
    </header>
  )
}
