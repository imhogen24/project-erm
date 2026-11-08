import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// A tab hanging from the top line of a frame, wider at the top than at the
// bottom, with its own slanted sides. It holds a title and its actions. The
// drawing is stretched to the tab's size, so the lines stay one pixel thick.
export function FrameTab({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={cn(
        "relative mx-4 h-[calc(var(--cell)*3/4)] xl:mx-0 xl:ml-[12%] xl:w-[70%]",
        className
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <polygon points="0,0 3,100 97,100 100,0" fill="var(--background)" />
        <polyline
          points="0,0 3,100 97,100 100,0"
          fill="none"
          stroke="var(--rule)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative flex h-full items-center justify-between gap-4 px-[7%]">
        {children}
      </div>
    </div>
  )
}
