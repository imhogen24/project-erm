import { describe, expect, test } from "vitest"

import {
  defaultFilters,
  filterProjects,
  filtersQuery,
  readFilters,
} from "./project-filters"

const project = (
  id: string,
  name: string,
  status: "active" | "on_hold" | "completed" | "closed" | "rejected",
  serviceTrack: "Tier_1" | "Tier_3" = "Tier_1"
) => ({ id, name, requestId: `T1-${id}00`, serviceTrack, status })

const projects = [
  project("1", "Acme Dryer", "active"),
  project("2", "Bolga Mill", "on_hold", "Tier_3"),
  project("3", "Cape Kiln", "completed"),
  project("4", "Dawa Press", "closed", "Tier_3"),
  project("5", "Ewe Oven", "rejected"),
]

const names = (list: { name: string }[]) => list.map((each) => each.name)

describe("readFilters", () => {
  test("an empty address gives the defaults", () => {
    expect(readFilters({})).toEqual(defaultFilters)
  })

  test("unknown values fall back to the defaults", () => {
    expect(
      readFilters({ status: "lost", tier: "Tier_9", mine: "yes" })
    ).toEqual(defaultFilters)
  })

  test("reads each filter, trimming the search", () => {
    expect(
      readFilters({ q: "  acme ", status: "all", tier: "Tier_3", mine: "1" })
    ).toEqual({ query: "acme", status: "all", tier: "Tier_3", mine: true })
  })

  test("the first of a repeated value wins", () => {
    expect(readFilters({ status: ["finished", "all"] }).status).toBe("finished")
  })
})

describe("filtersQuery", () => {
  test("leaves the defaults out", () => {
    expect(filtersQuery(defaultFilters)).toBe("")
  })

  test("round-trips through readFilters", () => {
    const filters = {
      query: "kiln",
      status: "finished",
      tier: "Tier_1",
      mine: true,
    } as const

    expect(
      readFilters(
        Object.fromEntries(new URLSearchParams(filtersQuery(filters)))
      )
    ).toEqual(filters)
  })
})

describe("filterProjects", () => {
  const none = new Set<string>()

  test("shows running projects by default", () => {
    expect(names(filterProjects(projects, defaultFilters, none))).toEqual([
      "Acme Dryer",
      "Bolga Mill",
    ])
  })

  test("finished is completed and closed", () => {
    expect(
      names(
        filterProjects(
          projects,
          { ...defaultFilters, status: "finished" },
          none
        )
      )
    ).toEqual(["Cape Kiln", "Dawa Press"])
  })

  test("searches the name or the request ID, ignoring case", () => {
    const all = { ...defaultFilters, status: "all" } as const

    expect(
      names(filterProjects(projects, { ...all, query: "KILN" }, none))
    ).toEqual(["Cape Kiln"])
    expect(
      names(filterProjects(projects, { ...all, query: "t1-500" }, none))
    ).toEqual(["Ewe Oven"])
  })

  test("filters by tier", () => {
    expect(
      names(
        filterProjects(
          projects,
          { ...defaultFilters, status: "all", tier: "Tier_3" },
          none
        )
      )
    ).toEqual(["Bolga Mill", "Dawa Press"])
  })

  test("puts the projects waiting for me first", () => {
    expect(
      names(filterProjects(projects, defaultFilters, new Set(["2"])))
    ).toEqual(["Bolga Mill", "Acme Dryer"])
  })

  test("needs me keeps only the projects waiting for me", () => {
    expect(
      names(
        filterProjects(
          projects,
          { ...defaultFilters, status: "all", mine: true },
          new Set(["4"])
        )
      )
    ).toEqual(["Dawa Press"])
  })
})
