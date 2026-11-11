import type { CSSProperties, ReactNode } from "react"

import { Grain } from "@/components/grain"
import { RecordTopBar } from "@/components/record-top-bar"

// Every tool is drawn the same way, in two boxes beside the sidebar: the bar
// with the project, the tool's name and state and the document control, then
// the sheet with only the tool's own tables. A tool never draws its own
// header. The sheet is an `@container`, so what is inside it changes with the
// sheet's width, not the screen's.
export function ToolSheet({
  topBar,
  columns,
  children,
}: {
  topBar: Parameters<typeof RecordTopBar>[0]
  // The most columns any table on this sheet has; every table's columns are
  // sized in these equal parts.
  columns: number
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[calc(var(--cell)/4)] xl:gap-0">
      {/* Pinned on a wide screen, so the document control stays in view. */}
      <div className="paper-mat">
        <RecordTopBar {...topBar} />
      </div>
      <div
        className="page-sheet grid-square @container relative isolate"
        // SAFETY: React hands custom properties such as --page-columns to the
        // DOM untouched; CSSProperties only leaves them out of its known names.
        style={{ "--page-columns": columns } as CSSProperties}
      >
        <Grain />
        <div className="relative flex flex-1 flex-col gap-8 px-6 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
