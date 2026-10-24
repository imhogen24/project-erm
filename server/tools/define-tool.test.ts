import { describe, expect, it } from "vitest"

import { defineTool, type ToolInput } from "./define-tool"

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

const operands: Extract<ToolInput["fields"][number], { type: "table" }> = {
  key: "operands",
  label: "Operands",
  type: "table",
  columns: [
    {
      key: "operand",
      label: "Operand",
      type: "select",
      options: ["Material", "Energy", "Information", "Living thing"],
    },
    { key: "input", label: "Input", type: "text" },
  ],
  prefilledRows: ["Material", "Energy", "Information", "Living thing"],
}

function withFields(fields: ToolInput["fields"]) {
  return defineTool({
    id: "D1.3",
    name: "Technical Intake",
    workbook: "wb01",
    fields,
  })
}

describe("defineTool, the wider field types", () => {
  it("accepts every new field type", () => {
    const tool = withFields([
      operands,
      {
        key: "triage",
        label: "Triage",
        type: "checklist",
        items: ["Readable"],
      },
      { key: "pmSignature", label: "PM signature", type: "signature" },
      { key: "budget", label: "Budget", type: "currency" },
      { key: "share", label: "Share", type: "percentage" },
      { key: "senderEmail", label: "Sender email", type: "email" },
      { key: "timeReceived", label: "Time received", type: "time" },
      { key: "emailLink", label: "Email link", type: "fileLink" },
      {
        key: "script",
        label: "Script",
        type: "instruction",
        content: "Dear client",
      },
      {
        key: "exclusions",
        label: "Exclusions",
        type: "staticList",
        items: ["No FEA"],
      },
    ])

    expect(tool.fields).toHaveLength(10)
  })

  it("refuses a table with two columns sharing a key", () => {
    expect(() =>
      withFields([
        {
          key: "log",
          label: "Log",
          type: "table",
          columns: [
            { key: "note", label: "Note", type: "text" },
            { key: "note", label: "Note again", type: "longText" },
          ],
        },
      ])
    ).toThrow()
  })

  it("refuses a table with no columns", () => {
    expect(() =>
      withFields([{ key: "log", label: "Log", type: "table", columns: [] }])
    ).toThrow()
  })

  it("refuses a table inside a table", () => {
    expect(() =>
      withFields([
        {
          key: "log",
          label: "Log",
          type: "table",
          columns: [
            // @ts-expect-error a table cell cannot hold a table
            { key: "inner", label: "Inner", type: "table", columns: [] },
          ],
        },
      ])
    ).toThrow()
  })

  it("refuses prefilled rows that repeat a label", () => {
    expect(() =>
      withFields([{ ...operands, prefilledRows: ["Material", "Material"] }])
    ).toThrow()
  })

  it("refuses a prefilled label that the first column's options do not allow", () => {
    expect(() =>
      withFields([{ ...operands, prefilledRows: ["Material", "Water"] }])
    ).toThrow()
  })

  it("refuses prefilled rows when the first column cannot hold a label", () => {
    expect(() =>
      withFields([
        {
          key: "measures",
          label: "Measures",
          type: "table",
          columns: [{ key: "value", label: "Value", type: "number" }],
          prefilledRows: ["Length"],
        },
      ])
    ).toThrow()
  })

  it("accepts a subtotal on a currency column", () => {
    const tool = withFields([
      {
        key: "labour",
        label: "Labour",
        type: "table",
        columns: [
          { key: "module", label: "Module", type: "text" },
          { key: "cost", label: "Cost", type: "currency" },
        ],
        subtotal: "cost",
      },
    ])

    expect(tool.fields[0]).toMatchObject({ subtotal: "cost" })
  })

  it("refuses a subtotal on a column that is not currency, or not there", () => {
    for (const subtotal of ["module", "nope"]) {
      expect(() =>
        withFields([
          {
            key: "labour",
            label: "Labour",
            type: "table",
            columns: [
              { key: "module", label: "Module", type: "text" },
              { key: "cost", label: "Cost", type: "currency" },
            ],
            subtotal,
          },
        ])
      ).toThrow()
    }
  })

  it("refuses a checklist with no items, or a repeated item", () => {
    for (const items of [[], ["Readable", "Readable"]]) {
      expect(() =>
        withFields([
          { key: "triage", label: "Triage", type: "checklist", items },
        ])
      ).toThrow()
    }
  })

  it("refuses a signature, instruction or static list marked required", () => {
    const fields: ToolInput["fields"] = [
      { key: "sig", label: "Sig", type: "signature", required: true },
      {
        key: "script",
        label: "Script",
        type: "instruction",
        content: "Dear client",
        required: true,
      },
      {
        key: "exclusions",
        label: "Exclusions",
        type: "staticList",
        items: ["No FEA"],
        required: true,
      },
    ]

    for (const field of fields) {
      expect(() => withFields([field])).toThrow()
    }
  })
})

describe("defineTool, tier variants", () => {
  it("serves both tiers unless it says otherwise", () => {
    expect(withFields([client]).tier).toBe("both")
  })

  it("accepts a Tier 3 variant that names the tool it replaces", () => {
    const tool = defineTool({
      id: "T3.D1.3a",
      name: "T3 Technical Intake",
      workbook: "wb01",
      tier: 3,
      replaces: "D1.3",
      fields: [client],
    })

    expect(tool).toMatchObject({ tier: 3, replaces: "D1.3" })
  })

  it("refuses a tool for both tiers that replaces another", () => {
    expect(() =>
      defineTool({
        id: "T3.D1.3a",
        name: "T3 Technical Intake",
        workbook: "wb01",
        replaces: "D1.3",
        fields: [client],
      })
    ).toThrow()
  })

  it("refuses a tool that replaces itself", () => {
    expect(() =>
      defineTool({
        id: "D1.3",
        name: "Technical Intake",
        workbook: "wb01",
        tier: 3,
        replaces: "D1.3",
        fields: [client],
      })
    ).toThrow()
  })

  it("refuses a tier that does not exist", () => {
    expect(() =>
      defineTool({
        id: "D1.3",
        name: "Technical Intake",
        workbook: "wb01",
        // @ts-expect-error there is no Tier 2
        tier: 2,
        fields: [client],
      })
    ).toThrow()
  })
})
