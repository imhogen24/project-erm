import { LockIcon, LockOpenIcon } from "@phosphor-icons/react/ssr"

import type { ToolState } from "@/lib/tool-state"
import { cn } from "@/lib/utils"

// Where a tool stands, drawn as a small square. Not started is a still grey
// dotted square. While someone works on it, orange dots travel round it
// clockwise, so it reads as live. Once it is final the square is solid orange.
export function ToolMark({
  state,
  className,
}: {
  state: ToolState
  className?: string
}) {
  const working = state === "draft" || state === "submitted"
  const done = state === "approved" || state === "locked"

  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      data-progress={working ? "active" : done ? "done" : "none"}
      className={cn("size-3 shrink-0", className)}
    >
      {done ? (
        <rect x="1" y="1" width="10" height="10" className="fill-primary" />
      ) : (
        <rect
          x="1"
          y="1"
          width="10"
          height="10"
          fill="none"
          strokeWidth={working ? 2 : 1.5}
          strokeLinecap="round"
          strokeDasharray={working ? "0 4" : "0 3.2"}
          className={cn(
            working ? "tool-march stroke-primary" : "stroke-foreground/40"
          )}
        />
      )}
    </svg>
  )
}

// Open while the tool can still change, closed once it is locked, so a person
// knows before opening it whether it can be edited.
export function ToolLock({ state }: { state: ToolState }) {
  const closed = state === "approved" || state === "locked"
  const Icon = closed ? LockIcon : LockOpenIcon

  return (
    <Icon
      aria-hidden
      weight={closed ? "fill" : "bold"}
      data-lock={closed ? "closed" : "open"}
      className={cn(
        "size-[18px] shrink-0",
        closed ? "text-primary" : "text-foreground/45"
      )}
    />
  )
}
