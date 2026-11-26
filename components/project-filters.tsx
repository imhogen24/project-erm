"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { CountBadge } from "@/components/count-badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  filtersQuery,
  type ProjectFilters as Filters,
  statusFilters,
  tierFilters,
} from "@/lib/project-filters"

// How long the search waits after the last key before it narrows the list.
const SEARCH_PAUSE = 250

// The home page's search and filters. Each change rewrites the page address,
// and the page narrows the projects on the server. The controls are slimmer
// than a form's so they fit the hatched strip, half a square tall.
export function ProjectFilters({
  filters,
  waitingCount,
}: {
  filters: Filters
  // How many of the projects the other filters leave are waiting for this
  // person, shown on the "Needs me" side of the switch.
  waitingCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(filters.query)
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(pause.current), [])

  const go = (next: Filters) => {
    const search = filtersQuery(next)

    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      })
    })
  }

  return (
    <div
      role="search"
      aria-label="Filter projects"
      data-pending={pending}
      className="flex w-full flex-wrap items-center gap-2"
    >
      {/* Which projects the list is drawn from: all of them, or only those
          waiting for this person. A view, not a button, so it always shows
          which side is on, and the filters after it apply within it. */}
      <ToggleGroup
        type="single"
        spacing={0}
        aria-label="Show"
        value={filters.mine ? "mine" : "all"}
        onValueChange={(value) => {
          // Pressing the side that is already on keeps it on.
          if (value) {
            go({ ...filters, query, mine: value === "mine" })
          }
        }}
        className="segmented segmented-compact"
      >
        <ToggleGroupItem value="all" className="segmented-item">
          All projects
        </ToggleGroupItem>
        <ToggleGroupItem
          value="mine"
          data-tone="good"
          className="segmented-item"
        >
          Needs me
          <CountBadge
            count={waitingCount}
            one="project waiting for you"
            many="projects waiting for you"
          />
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="relative min-w-0 flex-1 basis-56">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search projects"
          placeholder="Search by name or request ID"
          value={query}
          onChange={(event) => {
            const value = event.target.value

            setQuery(value)
            clearTimeout(pause.current)
            pause.current = setTimeout(
              () => go({ ...filters, query: value.trim() }),
              SEARCH_PAUSE
            )
          }}
          className="h-9 bg-background pl-9 text-sm md:text-sm"
        />
      </div>
      <Select
        value={filters.status}
        onValueChange={(value) =>
          go({
            ...filters,
            query,
            status:
              statusFilters.find((filter) => filter.value === value)?.value ??
              filters.status,
          })
        }
      >
        <SelectTrigger aria-label="Status" className="h-9 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusFilters.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {filter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.tier}
        onValueChange={(value) =>
          go({
            ...filters,
            query,
            tier:
              tierFilters.find((filter) => filter.value === value)?.value ??
              filters.tier,
          })
        }
      >
        <SelectTrigger aria-label="Tier" className="h-9 w-32 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tierFilters.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {filter.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
