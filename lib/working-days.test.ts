import { describe, expect, it } from "vitest"

import type { JsonObject } from "@/db/schema"
import {
  computedCells,
  daysText,
  weekdaysBetween,
} from "@/lib/computed-columns"
import { alignApplied, followRows } from "@/lib/follow-dates"
import { defineTool } from "@/server/tools/define-tool"

describe("weekdaysBetween", () => {
  it("counts Monday to Friday, both days counted", () => {
    // Monday 4 January 2027 to Friday 22 January 2027.
    expect(weekdaysBetween("2027-01-04", "2027-01-22")).toBe(15)
    expect(weekdaysBetween("2027-01-04", "2027-01-04")).toBe(1)
    // Saturday to Sunday.
    expect(weekdaysBetween("2027-01-09", "2027-01-10")).toBe(0)
    // Friday to Monday.
    expect(weekdaysBetween("2027-01-08", "2027-01-11")).toBe(2)
  })

  it("is undefined while a day is missing or the end is before the start", () => {
    expect(weekdaysBetween("2027-01-04", "")).toBeUndefined()
    expect(weekdaysBetween(undefined, "2027-01-04")).toBeUndefined()
    expect(weekdaysBetween("2027-01-22", "2027-01-04")).toBeUndefined()
  })
})

describe("daysText", () => {
  it("writes days as the sheet does", () => {
    expect(daysText(15)).toBe("15 Days")
    expect(daysText(1)).toBe("1 Day")
  })
})

describe("computed working days", () => {
  const { fields } = defineTool({
    id: "X1.1",
    name: "Working days",
    workbook: "wb04",
    tier: 1,
    fields: [
      {
        key: "phases",
        label: "Phases",
        type: "table",
        columns: [
          { key: "startDate", label: "Start", type: "date" },
          { key: "endDate", label: "End", type: "date" },
          {
            key: "workingDays",
            label: "Days",
            type: "number",
            systemFilled: true,
            computed: { weekdaysFrom: "startDate", to: "endDate" },
          },
        ],
      },
    ],
  })

  const values: JsonObject = {
    phases: [
      { startDate: "2027-01-04", endDate: "2027-01-22" },
      { startDate: "2027-01-23" },
    ],
  }

  it("shows each row's working days, and stores them as numbers", () => {
    expect(computedCells(fields, values)).toEqual({
      phases: [
        {
          startDate: "2027-01-04",
          endDate: "2027-01-22",
          workingDays: "15 Days",
        },
        { startDate: "2027-01-23", workingDays: "" },
      ],
    })

    expect(computedCells(fields, values, "stored")).toMatchObject({
      phases: [{ workingDays: 15 }, { workingDays: null }],
    })
  })
})

describe("followRows", () => {
  const followers = [{ key: "startDate", column: "endDate", plusDays: 1 }]

  it("starts each row the day after the row above ends, top down", () => {
    const step = followRows(
      [
        { startDate: "2027-01-04", endDate: "2027-01-22" },
        { startDate: "", endDate: "2027-01-29" },
        { startDate: "" },
      ],
      followers,
      []
    )

    expect(step.moved).toBe(true)
    expect(step.rows.map((row) => row.startDate)).toEqual([
      "2027-01-04",
      "2027-01-23",
      "2027-01-30",
    ])
  })

  it("follows a changed end, but keeps a start picked by hand", () => {
    const first = followRows(
      [{ startDate: "2027-01-04", endDate: "2027-01-22" }, { startDate: "" }],
      followers,
      []
    )

    const moved = followRows(
      [{ ...first.rows[0], endDate: "2027-01-29" }, first.rows[1]!],
      followers,
      first.applied
    )

    expect(moved.rows[1]!.startDate).toBe("2027-01-30")

    const picked = followRows(
      [moved.rows[0]!, { startDate: "2027-02-08" }],
      followers,
      moved.applied
    )

    const kept = followRows(
      [{ ...picked.rows[0], endDate: "2027-01-15" }, picked.rows[1]!],
      followers,
      picked.applied
    )

    expect(kept.moved).toBe(false)
    expect(kept.rows[1]!.startDate).toBe("2027-02-08")
  })

  it("never moves the first row", () => {
    const step = followRows([{ startDate: "" }], followers, [])

    expect(step.moved).toBe(false)
    expect(step.rows[0]!.startDate).toBe("")
  })
})

describe("alignApplied", () => {
  it("keeps each row's applied dates with it when a row above is removed", () => {
    const a = { startDate: "2027-01-04", endDate: "2027-01-08" }
    const b = { startDate: "2027-01-09", endDate: "2027-01-15" }
    const c = { startDate: "2027-01-16" }

    const applied = [
      {},
      { startDate: "2027-01-09" },
      { startDate: "2027-01-16" },
    ]

    expect(alignApplied([a, b, c], [a, c], applied)).toEqual([
      {},
      { startDate: "2027-01-16" },
    ])
  })

  it("keeps an edited row's applied dates in its place", () => {
    const a = { startDate: "2027-01-04", endDate: "2027-01-08" }
    const b = { startDate: "2027-01-09" }

    expect(
      alignApplied(
        [a, b],
        [{ ...a, endDate: "2027-01-15" }, b],
        [{}, { startDate: "2027-01-09" }]
      )
    ).toEqual([{}, { startDate: "2027-01-09" }])
  })
})
