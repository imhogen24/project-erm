import { Badge } from "@/components/ui/badge"
import type { ToolState } from "@/lib/tool-state"
import { cn } from "@/lib/utils"

// A state is drawn the way a drawing draws its lines, as a frame inside the
// tool's square: dotted for what is not there yet, dashed for work that can
// still change, solid as it firms up, heavy once approved, and a filled square
// once locked. Locked is the darkest of the five.
const states: Record<
  ToolState,
  { label: string; square: string; frame: string; sample: string }
> = {
  notStarted: {
    label: "Not started",
    square: "bg-background",
    frame: "border-2 border-dotted border-foreground/35",
    sample: "border-t-2 border-dotted border-foreground/50",
  },
  draft: {
    label: "Draft",
    square: "bg-background",
    frame: "border-2 border-dashed border-foreground/60",
    sample: "border-t-2 border-dashed border-foreground/70",
  },
  submitted: {
    label: "Submitted",
    square: "bg-[color-mix(in_oklab,var(--primary)_7%,var(--background))]",
    frame: "border-2 border-foreground/70",
    sample: "border-t-2 border-foreground/70",
  },
  approved: {
    label: "Approved",
    square: "bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))]",
    frame: "border-[3px] border-foreground",
    sample: "border-t-[3px] border-foreground",
  },
  locked: {
    label: "Locked",
    square: "bg-foreground text-background",
    frame: "border-2 border-background/70",
    sample: "border-t-[3px] border-background",
  },
}

export function stateSquare(state: ToolState) {
  return states[state].square
}

// The frame drawn inside a tool's square, inset from the shared grid line.
export function stateFrame(state: ToolState) {
  return states[state].frame
}

export function StateBadge({ state }: { state: ToolState }) {
  const { label, sample } = states[state]

  return (
    <Badge
      variant="outline"
      className="h-6 gap-2 rounded-none border-0 bg-transparent px-0 text-xs text-inherit dark:bg-transparent"
    >
      <span aria-hidden className={cn("w-6", sample)} />
      {label}
    </Badge>
  )
}
