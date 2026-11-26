import { SidebarProjectRows } from "@/components/sidebar-project-rows"
import type { SidebarList } from "@/lib/sidebar-list"

// More than the tallest screen holds; the rows that don't fit are left out.
const MOST = 60

export function SidebarProjects({ list }: { list: SidebarList }) {
  const { title, rows, more } = list

  if (rows.length === 0) {
    return null
  }

  return (
    <section aria-label={title} className="nav-section min-h-0 flex-1">
      <p className="nav-group-title">
        {title}
        <span
          data-tone={rows.some((row) => row.tone === "open") ? "open" : "quiet"}
          className="nav-count"
        >
          {rows.length}
        </span>
      </p>
      <SidebarProjectRows rows={rows.slice(0, MOST)} more={more} />
    </section>
  )
}
