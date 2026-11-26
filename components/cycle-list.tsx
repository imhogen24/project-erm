import Link from "next/link"

import { StateBadge } from "@/components/state-badge"
import { Button } from "@/components/ui/button"
import type { CycleEntry } from "@/lib/cycles"

// A tool run once per payment milestone, such as D3.3, lists each
// milestone's record, so any of them can be opened. The one on screen is
// marked as the current page.
export function CycleList({
  toolId,
  href,
  cycles,
  current,
}: {
  toolId: string
  href: string
  cycles: CycleEntry[]
  current: number
}) {
  if (cycles.length === 0) {
    return null
  }

  return (
    <nav aria-label={`${toolId} by milestone`}>
      <ul className="flex flex-wrap gap-2">
        {cycles.map((entry) => (
          <li key={entry.cycle} className="max-w-full min-w-0">
            <Button
              asChild
              size="sm"
              variant={entry.cycle === current ? "secondary" : "outline"}
              className="h-auto min-h-8 max-w-full py-1"
            >
              <Link
                href={`${href}?cycle=${entry.cycle}`}
                aria-current={entry.cycle === current ? "page" : undefined}
              >
                <span className="min-w-0 truncate">
                  {toolId} · {entry.label}
                </span>
                <StateBadge state={entry.state} />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
