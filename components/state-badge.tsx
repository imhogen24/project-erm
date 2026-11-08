import { Badge } from "@/components/ui/badge"
import type { ToolState } from "@/lib/tool-state"
import { cn } from "@/lib/utils"

// A state is a filled badge, stronger as the tool firms up: faint grey for
// not started, then draft, then orange once submitted and approved, and light
// on the dark square once locked. The tool's square sits on the page grid and
// has no border of its own.
const states: Record<
  ToolState,
  { label: string; square: string; badge: string }
> = {
  notStarted: {
    label: "Not started",
    square: "bg-background",
    badge: "bg-foreground/10 text-foreground",
  },
  draft: {
    label: "Draft",
    square: "bg-background",
    badge: "bg-foreground/15 text-foreground",
  },
  submitted: {
    label: "Submitted",
    square: "bg-[color-mix(in_oklab,var(--primary)_7%,var(--background))]",
    badge: "bg-primary/20 text-foreground",
  },
  approved: {
    label: "Approved",
    square: "bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))]",
    badge: "bg-primary text-primary-foreground",
  },
  locked: {
    label: "Locked",
    square: "bg-foreground text-background",
    badge: "bg-background text-foreground",
  },
}

export function stateLabel(state: ToolState) {
  return states[state].label
}

export function stateSquare(state: ToolState) {
  return states[state].square
}

export function StateBadge({ state }: { state: ToolState }) {
  const { label, badge } = states[state]

  return (
    <Badge
      variant="outline"
      className={cn("h-6 rounded-none border-0 px-2.5 text-xs", badge)}
    >
      {label}
    </Badge>
  )
}
