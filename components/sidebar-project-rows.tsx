"use client"

import Link from "next/link"
import { useLayoutEffect, useRef, useState } from "react"

import type { SidebarList } from "@/lib/sidebar-list"

// The sidebar's projects, as many as fit the room left in it. The list wraps
// into a second column that is cut off (.nav-fit), so a row is shown whole or
// not at all; a row that wrapped is made inert, out of reach of the keyboard
// and screen readers. The link to the full list shows once a row is left out,
// and keeps its room either way so the rows don't jump.
export function SidebarProjectRows({
  rows,
  more,
}: Pick<SidebarList, "rows" | "more">) {
  const list = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(rows.length)

  useLayoutEffect(() => {
    const box = list.current

    if (!box) {
      return
    }

    const fit = () => {
      const links = [...box.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      )

      const column = links[0]?.offsetLeft ?? 0

      setShown(links.filter((link) => link.offsetLeft === column).length)
    }

    fit()

    const observer = new ResizeObserver(fit)

    observer.observe(box)

    return () => observer.disconnect()
  }, [rows])

  return (
    <>
      <div ref={list} className="nav-fit">
        {rows.map((row, index) => (
          <Link
            key={row.id}
            href={row.href}
            inert={index >= shown}
            className="nav-project"
          >
            <span aria-hidden data-tone={row.tone} className="nav-dot" />
            <span className="truncate">{row.name}</span>
          </Link>
        ))}
      </div>
      <Link
        href={more.href}
        className={shown < rows.length ? "nav-more" : "nav-more invisible"}
      >
        {more.label}
      </Link>
    </>
  )
}
