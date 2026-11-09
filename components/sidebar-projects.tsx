import Link from "next/link"

import type { SidebarList } from "@/lib/sidebar-list"

// Enough to fill the sidebar without scrolling on a laptop.
const SHOWN = 8

export function SidebarProjects({ list }: { list: SidebarList }) {
  const { title, rows, more } = list

  if (rows.length === 0) {
    return null
  }

  return (
    <section aria-label={title} className="nav-section">
      <p className="nav-group-title">
        {title}
        <span
          data-tone={rows.some((row) => row.tone === "open") ? "open" : "quiet"}
          className="nav-count"
        >
          {rows.length}
        </span>
      </p>
      <div className="flex flex-col">
        {rows.slice(0, SHOWN).map((row) => (
          <Link key={row.id} href={row.href} className="nav-project">
            <span aria-hidden data-tone={row.tone} className="nav-dot" />
            <span className="truncate">{row.name}</span>
          </Link>
        ))}
      </div>
      {rows.length > SHOWN && (
        <Link href={more.href} className="nav-more">
          {more.label}
        </Link>
      )}
    </section>
  )
}
