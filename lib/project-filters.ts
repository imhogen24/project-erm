import type { ProjectStatus, ServiceTrack } from "@/db/schema"

// The home page's filters, kept in the page address so a filtered view
// survives a refresh and can be shared: ?q=acme&status=finished&tier=Tier_1&mine=1.

export const statusFilters = [
  { value: "running", label: "Running", statuses: ["active", "on_hold"] },
  { value: "finished", label: "Finished", statuses: ["completed", "closed"] },
  { value: "rejected", label: "Rejected", statuses: ["rejected"] },
  { value: "all", label: "All statuses", statuses: null },
] as const satisfies readonly {
  value: string
  label: string
  statuses: readonly ProjectStatus[] | null
}[]

export const tierFilters = [
  { value: "all", label: "All tiers" },
  { value: "Tier_1", label: "Tier 1" },
  { value: "Tier_3", label: "Tier 3" },
] as const

export type StatusFilter = (typeof statusFilters)[number]["value"]

export type TierFilter = (typeof tierFilters)[number]["value"]

export type ProjectFilters = {
  query: string
  status: StatusFilter
  tier: TierFilter
  // Only the projects where something is waiting for this person.
  mine: boolean
}

export const defaultFilters: ProjectFilters = {
  query: "",
  status: "running",
  tier: "all",
  mine: false,
}

type Param = string | string[] | undefined

function first(value: Param) {
  return Array.isArray(value) ? value[0] : value
}

// Anything the page address holds that is not a known filter is ignored.
export function readFilters(params: Record<string, Param>): ProjectFilters {
  const status = first(params.status)
  const tier = first(params.tier)

  return {
    query: (first(params.q) ?? "").trim(),
    status:
      statusFilters.find((filter) => filter.value === status)?.value ??
      defaultFilters.status,
    tier:
      tierFilters.find((filter) => filter.value === tier)?.value ??
      defaultFilters.tier,
    mine: first(params.mine) === "1",
  }
}

// The page address for a set of filters, leaving out the defaults.
export function filtersQuery(filters: ProjectFilters) {
  const params = new URLSearchParams()

  if (filters.query) {
    params.set("q", filters.query)
  }

  if (filters.status !== defaultFilters.status) {
    params.set("status", filters.status)
  }

  if (filters.tier !== defaultFilters.tier) {
    params.set("tier", filters.tier)
  }

  if (filters.mine) {
    params.set("mine", "1")
  }

  return params.toString()
}

type Filterable = {
  id: string
  name: string
  requestId: string
  serviceTrack: ServiceTrack
  status: ProjectStatus
}

// The projects that pass every filter. The search matches the name or the
// request ID, ignoring case. The projects waiting for this person come first,
// each group keeping its order.
export function filterProjects<T extends Filterable>(
  projects: readonly T[],
  filters: ProjectFilters,
  waitingForMe: ReadonlySet<string>
): T[] {
  const query = filters.query.toLowerCase()

  const statuses = statusFilters.find(
    (filter) => filter.value === filters.status
  )?.statuses

  const passing = projects.filter(
    (project) =>
      (!query ||
        project.name.toLowerCase().includes(query) ||
        project.requestId.toLowerCase().includes(query)) &&
      (!statuses || statuses.some((status) => status === project.status)) &&
      (filters.tier === "all" || project.serviceTrack === filters.tier) &&
      (!filters.mine || waitingForMe.has(project.id))
  )

  return [
    ...passing.filter((project) => waitingForMe.has(project.id)),
    ...passing.filter((project) => !waitingForMe.has(project.id)),
  ]
}
