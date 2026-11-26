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
  // On a wide screen the sidebar already names the page and holds its
  // actions, such as a project: there the header is a hatched strip and the
  // title is only read out.
  namedBySidebar?: boolean
  // Search and filters for the page's list. Under the title on a narrow
  // screen; on a wide one, with namedBySidebar, inside the hatched strip.
  toolbar?: ReactNode
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
  namedBySidebar = false,
  toolbar,
  children,
}: Props) {
  return (
    <div className="page-sheet grid-frame relative isolate">
      <Grain />
      <header
        data-named-by-sidebar={namedBySidebar}
        data-toolbar={Boolean(toolbar)}
        className="page-sheet-head"
      >
        {above}
        <div className="page-sheet-title flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-4xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
              {title}
            </h1>
            {below}
          </div>
          {actions && (
            <div className="page-sheet-actions flex shrink-0 gap-2">
              {actions}
            </div>
          )}
        </div>
        {toolbar && <div className="page-sheet-toolbar">{toolbar}</div>}
      </header>
      <div data-flush={flush} className="page-sheet-body">
        {children}
      </div>
    </div>
  )
}
