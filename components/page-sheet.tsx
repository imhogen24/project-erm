import type { ReactNode } from "react"

import { Grain } from "@/components/grain"

type Props = {
  // Above the title, such as a back link.
  above?: ReactNode
  title: ReactNode
  // Under the title: a count, a line of facts.
  below?: ReactNode
  // Buttons for the whole page, at the right of the title on a wide screen.
  actions?: ReactNode
  // A body that draws its own boxes edge to edge, such as a grid of tiles,
  // has no padding, so the boxes share the sheet's lines.
  flush?: boolean
  children: ReactNode
}

// The one sheet a page is drawn on, beside the sidebar: as tall as the sidebar
// at least, its title at the top over a ruled line, then the page itself.
export function PageSheet({
  above,
  title,
  below,
  actions,
  flush = false,
  children,
}: Props) {
  return (
    <div className="page-sheet grid-frame relative isolate">
      <Grain />
      <header className="page-sheet-head">
        {above}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-4xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
              {title}
            </h1>
            {below}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      </header>
      <div data-flush={flush} className="page-sheet-body">
        {children}
      </div>
    </div>
  )
}
