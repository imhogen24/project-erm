import { describe, expect, it } from "vitest"

import { defineTool } from "./define-tool"

const client = { key: "client", label: "Client", type: "text" } as const

describe("defineTool", () => {
  it("accepts a valid tool and returns it", () => {
    const tool = defineTool({
      id: "D1.1",
      name: "Client Email / Web Form",
      workbook: "wb01",
      fields: [client, { key: "budget", label: "Budget", type: "number" }],
    })

    expect(tool.id).toBe("D1.1")
    expect(tool.fields.map((field) => field.key)).toEqual(["client", "budget"])
  })

  it("accepts all six field types", () => {
    const tool = defineTool({
      id: "D1.1",
      name: "All types",
      workbook: "wb01",
      fields: [
        { key: "a", label: "A", type: "text" },
        { key: "b", label: "B", type: "longText" },
        { key: "c", label: "C", type: "number" },
        { key: "d", label: "D", type: "date" },
        { key: "e", label: "E", type: "boolean" },
        { key: "f", label: "F", type: "select", options: ["x", "y"] },
      ],
    })

    expect(tool.fields).toHaveLength(6)
  })

  it("treats a field as not required unless it says so", () => {
    const tool = defineTool({
      id: "D1.1",
      name: "Defaults",
      workbook: "wb01",
      fields: [client],
    })

    expect(tool.fields[0]!.required).toBe(false)
  })

  it("refuses two fields with the same key", () => {
    expect(() =>
      defineTool({
        id: "D1.1",
        name: "Duplicate",
        workbook: "wb01",
        fields: [client, { ...client, label: "Client again" }],
      })
    ).toThrow()
  })

  it("refuses a select field with no options", () => {
    expect(() =>
      defineTool({
        id: "D1.1",
        name: "Empty select",
        workbook: "wb01",
        fields: [{ key: "kind", label: "Kind", type: "select", options: [] }],
      })
    ).toThrow()
  })

  it("refuses a field type that does not exist", () => {
    expect(() =>
      defineTool({
        id: "D1.1",
        name: "Bad type",
        workbook: "wb01",
        // @ts-expect-error "banana" is not one of the six field types
        fields: [{ key: "x", label: "X", type: "banana" }],
      })
    ).toThrow()
  })

  it("refuses an inherited field that is also required", () => {
    expect(() =>
      defineTool({
        id: "D1.15",
        name: "Inherited and required",
        workbook: "wb01",
        fields: [
          {
            key: "totalValue",
            label: "Total value",
            type: "number",
            required: true,
            inherited: { tool: "D1.14", field: "totalValue" },
          },
        ],
      })
    ).toThrow()
  })

  it("accepts an inherited field that is not required", () => {
    const tool = defineTool({
      id: "D1.15",
      name: "Inherited",
      workbook: "wb01",
      fields: [
        {
          key: "totalValue",
          label: "Total value",
          type: "number",
          inherited: { tool: "D1.14", field: "totalValue" },
        },
      ],
    })

    expect(tool.fields[0]!.inherited).toEqual({
      tool: "D1.14",
      field: "totalValue",
    })
  })

  it("refuses a tool with a blank id, name or workbook", () => {
    for (const bad of [
      { id: "", name: "N", workbook: "wb01" },
      { id: "D1.1", name: "", workbook: "wb01" },
      { id: "D1.1", name: "N", workbook: "" },
    ]) {
      expect(() => defineTool({ ...bad, fields: [client] })).toThrow()
    }
  })
})
