import type { ReactNode } from "react"

import { Grain } from "@/components/grain"
import { SheetTitleBlock } from "@/components/sheet-title-block"

type Props = Parameters<typeof SheetTitleBlock>[0] & { children: ReactNode }

// The one sheet every tool is drawn on: the title block with the document
// control facts, then the tool's own tables. A tool never draws its own header,
// so they all look and read the same. The sheet is an `@container`, so what is
// inside it changes with the sheet's width, not the screen's.
export function ToolSheet({ children, ...titleBlock }: Props) {
  return (
    <div className="page-sheet grid-square @container relative isolate">
      <Grain />
      <SheetTitleBlock {...titleBlock} />
      <div className="relative flex flex-1 flex-col gap-8 px-6 py-8">
        {children}
      </div>
    </div>
  )
}
