import { describe, expect, it } from "vitest"

import type { FormValues, TableField } from "@/lib/tool-definition"
import { d43 } from "@/workbooks/wb04/tools/d4-3"

import {
  namesIn,
  peopleColumnSources,
  withColumnPeople,
} from "./people-columns"

const provisioning = d43.fields.find(
  (field): field is TableField =>
    field.type === "table" && field.key === "provisioning"
)!

function engineerOptions(table: TableField) {
  const column = table.columns.find((each) => each.key === "engineer")

  return column?.type === "select" ? column.options : undefined
}

describe("selects of people from another column", () => {
  it("follows the tables they list from", () => {
    expect(peopleColumnSources(d43.fields)).toEqual(["roster"])
  })

  it("lists the names the record holds there, in order, each once", () => {
    const values: FormValues = {
      roster: [
        { engineer: "Fiifi Acquah" },
        { engineer: " " },
        { engineer: "Kojo Antwi" },
        { engineer: "Fiifi Acquah" },
        { engineer: null },
      ],
    }

    expect(namesIn(values, { field: "roster", column: "engineer" })).toEqual([
      "Fiifi Acquah",
      "Kojo Antwi",
    ])
    expect(engineerOptions(withColumnPeople(provisioning, values))).toEqual([
      "Fiifi Acquah",
      "Kojo Antwi",
    ])
  })

  it("lists no one while the roster is empty", () => {
    expect(engineerOptions(withColumnPeople(provisioning, {}))).toEqual([])
  })
})
