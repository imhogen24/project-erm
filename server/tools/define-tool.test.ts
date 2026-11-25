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

  it("refuses a system option that is not one of the select's options", () => {
    expect(() =>
      defineTool({
        id: "D1.1",
        name: "System option",
        workbook: "wb01",
        fields: [
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Pending", "Reviewed"],
            systemOptions: ["Approved"],
          },
        ],
      })
    ).toThrow()
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

  it("keeps a table's read-only flag, and a table without it stays editable", () => {
    const tool = withFields([
      { ...operands, readOnly: true },
      { ...operands, key: "other" },
    ])

    expect(
      tool.fields.map((each) => each.type === "table" && each.readOnly)
    ).toEqual([true, undefined])
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

describe("defineTool, PDF previews", () => {
  const appendix = {
    key: "appendixA",
    label: "Appendix A: D1.15 Project Brief & Draft Budget",
    type: "pdfPreview",
  } as const

  it("points to another tool, or to a stored PDF with its title", () => {
    const tool = withFields([
      { ...appendix, source: { tool: "D1.15" } },
      {
        ...appendix,
        key: "appendixD",
        source: { file: "company-sla.pdf", title: "Company SLA" },
      },
    ])

    expect(tool.fields.map((field) => field.type)).toEqual([
      "pdfPreview",
      "pdfPreview",
    ])
  })

  it("refuses a preview with no source, or a stored PDF with no title", () => {
    const fields = [
      { ...appendix },
      { ...appendix, source: {} },
      { ...appendix, source: { file: "company-sla.pdf" } },
      { ...appendix, source: { tool: "D1.15", file: "a.pdf", title: "A" } },
    ]

    for (const field of fields) {
      // SAFETY: each is a broken definition, to see it refused.
      expect(() => withFields([field as ToolInput["fields"][number]])).toThrow()
    }
  })

  it("refuses a stored PDF name that is not a plain lowercase .pdf", () => {
    for (const file of ["../secret.pdf", "Company SLA.pdf", "sla.docx", ""]) {
      expect(() =>
        withFields([{ ...appendix, source: { file, title: "SLA" } }])
      ).toThrow()
    }
  })

  it("refuses a preview marked required, inherited or system-filled", () => {
    const source = { tool: "D1.15" }

    const fields: ToolInput["fields"] = [
      { ...appendix, source, required: true },
      { ...appendix, source, systemFilled: true },
      {
        ...appendix,
        source,
        inherited: { tool: "D1.15", field: "budget" },
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

describe("defineTool, web request links", () => {
  const base = { id: "D1.4", name: "Acknowledgement", workbook: "wb01" }

  it("takes one column, or a column for each tier", () => {
    const tool = defineTool({
      ...base,
      fields: [
        {
          key: "email",
          label: "Email",
          type: "email",
          inherited: { request: "email" },
        },
        {
          key: "services",
          label: "Services",
          type: "text",
          inherited: {
            request: { Tier_1: "project_scope", Tier_3: "drafting_services" },
          },
        },
      ],
    })

    expect(tool.fields.map((field) => field.inherited)).toEqual([
      { request: { Tier_1: "email", Tier_3: "email" } },
      { request: { Tier_1: "project_scope", Tier_3: "drafting_services" } },
    ])
  })

  it("refuses a link that names a tool and a column of the request", () => {
    const both = { tool: "D1.3", field: "email", request: "email" }

    expect(() =>
      defineTool({
        ...base,
        fields: [
          { key: "email", label: "Email", type: "email", inherited: both },
        ],
      })
    ).toThrow()
  })

  it("refuses a request link on a table", () => {
    expect(() =>
      defineTool({
        ...base,
        fields: [
          {
            key: "rows",
            label: "Rows",
            type: "table",
            inherited: { request: "email" },
            columns: [{ key: "name", label: "Name", type: "text" }],
          },
        ],
      })
    ).toThrow()
  })

  it("refuses a request link on a table column", () => {
    expect(() =>
      defineTool({
        ...base,
        fields: [
          {
            key: "rows",
            label: "Rows",
            type: "table",
            columns: [
              {
                key: "name",
                label: "Name",
                type: "text",
                inherited: { request: "email" },
              },
            ],
          },
        ],
      })
    ).toThrow()
  })
})

type TableInput = Extract<ToolInput["fields"][number], { type: "table" }>

describe("defineTool, fixed rows of several columns", () => {
  const clauses = (
    extra: Partial<TableInput> = {},
    columns: TableInput["columns"] = []
  ): ToolInput => ({
    id: "D2.1",
    name: "Template",
    workbook: "wb02",
    fills: { "Client Name": "system", X: { field: "share" } },
    fields: [
      { key: "share", label: "Share", type: "percentage" },
      {
        key: "clauses",
        label: "Clauses",
        type: "table",
        fixedRows: [
          { category: "Parties", text: "With [Client Name], [X]% now." },
        ],
        columns: [
          { key: "sn", label: "SN", type: "text", numbered: "2" },
          { key: "category", label: "Category", type: "text" },
          { key: "text", label: "Text", type: "longText" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Active", "Archived"],
            startsAs: "Active",
          },
          ...columns,
        ],
        ...extra,
      },
    ],
  })

  it("accepts fixed rows, a numbered column and a starting option", () => {
    expect(defineTool(clauses()).fields).toHaveLength(2)
  })

  it("refuses a fixed value for a column that is not there", () => {
    expect(() =>
      defineTool(clauses({ fixedRows: [{ clause: "Parties" }] }))
    ).toThrow("Not a column of this table")
  })

  it("refuses a fixed value in the numbered column", () => {
    expect(() => defineTool(clauses({ fixedRows: [{ sn: "2.1" }] }))).toThrow(
      "A fixed row fixes only a column the form writes"
    )
  })

  it("refuses fixed rows beside labelled rows", () => {
    expect(() => defineTool(clauses({ lockedRows: ["Parties"] }))).toThrow(
      "not both"
    )
  })

  it("refuses a starting option the select does not have", () => {
    expect(() =>
      defineTool(
        clauses({}, [
          {
            key: "kind",
            label: "Kind",
            type: "select",
            options: ["A"],
            startsAs: "B",
          },
        ])
      )
    ).toThrow("A column starts as one of its select's options")
  })

  it("refuses a bracketed name nobody fills", () => {
    expect(() =>
      defineTool(
        clauses({
          fixedRows: [{ category: "Parties", text: "With [Client Name] [Y]" }],
        })
      )
    ).toThrow("is not listed in fills")
  })

  it("refuses a fill from a field the tool does not have", () => {
    expect(() =>
      defineTool({ ...clauses(), fills: { X: { field: "missing" } } })
    ).toThrow("which holds no value")
  })

  it("refuses locking on submit for a tool with no Submit", () => {
    expect(() =>
      defineTool({ ...clauses(), locksOnSubmit: true, withoutSubmit: true })
    ).toThrow("A tool without Submit cannot lock on submit")
  })
})

describe("defineTool, a table's PDF preview column", () => {
  const mapped = (
    extra: Partial<TableInput["columns"][number]> = {},
    preview: Partial<TableInput["columns"][number]> = {}
  ): ToolInput => ({
    id: "D2.2",
    name: "Draft",
    workbook: "wb02",
    fields: [
      {
        key: "variables",
        label: "Variables",
        type: "table",
        fixedRows: [{ variable: "Client", source: "D1.3" }],
        columns: [
          { key: "variable", label: "Variable", type: "text" },
          // SAFETY: each test adds options a text column takes.
          {
            key: "value",
            label: "Value",
            type: "text",
            ...extra,
          } as TableInput["columns"][number],
          // SAFETY: each test adds options a preview column takes.
          {
            key: "source",
            label: "Source Reference",
            type: "pdfPreview",
            ...preview,
          } as TableInput["columns"][number],
        ],
      },
    ],
  })

  it("takes each fixed row's tool from the row", () => {
    expect(defineTool(mapped()).fields).toHaveLength(1)
  })

  it("refuses a preview column that must be answered", () => {
    expect(() => defineTool(mapped({}, { required: true }))).toThrow(
      "A column the form never writes is never required"
    )
  })

  it("takes a hint for each fixed row, and refuses one for a row it does not have", () => {
    expect(
      defineTool(mapped({ placeholders: ["e.g. Acme Ltd"] })).fields
    ).toHaveLength(1)
    expect(() => defineTool(mapped({ placeholders: ["One", "Two"] }))).toThrow(
      "A placeholder is for one of the table's fixed rows"
    )
  })
})

describe("defineTool, values filled on lock and submit rules", () => {
  const routed = (extra: Partial<ToolInput> = {}): ToolInput => ({
    id: "D2.2",
    name: "Draft",
    workbook: "wb02",
    fields: [
      { key: "ready", label: "Ready?", type: "select", options: ["Yes", "No"] },
      {
        key: "draftedBy",
        label: "Drafted By",
        type: "text",
        systemFilled: true,
        filledOnLock: "submittedBy",
      },
      {
        key: "draftDate",
        label: "Date",
        type: "date",
        systemFilled: true,
        filledOnLock: "lockedAt",
      },
    ],
    ...extra,
  })

  it("accepts who submitted as text and the lock's day as a date", () => {
    expect(defineTool(routed()).fields).toHaveLength(3)
  })

  it("refuses a field filled on lock that the form could write", () => {
    expect(() =>
      defineTool(
        routed({
          fields: [
            {
              key: "draftedBy",
              label: "Drafted By",
              type: "text",
              filledOnLock: "submittedBy",
            },
          ],
        })
      )
    ).toThrow("A field filled on lock is system-filled")
  })

  it("refuses the lock's day in a text field", () => {
    expect(() =>
      defineTool(
        routed({
          fields: [
            {
              key: "draftDate",
              label: "Date",
              type: "text",
              systemFilled: true,
              filledOnLock: "lockedAt",
            },
          ],
        })
      )
    ).toThrow("a date for when it locked")
  })

  it("accepts a submit rule on one of a select's options", () => {
    expect(
      defineTool(
        routed({
          submitWhen: [{ field: "ready", is: "Yes", message: "Say Yes" }],
        })
      ).submitWhen
    ).toHaveLength(1)
  })

  it("refuses a submit rule on an option or field that is not there", () => {
    expect(() =>
      defineTool(
        routed({
          submitWhen: [{ field: "ready", is: "Maybe", message: "Say Yes" }],
        })
      )
    ).toThrow("ready is not a select with the option")
    expect(() =>
      defineTool(
        routed({
          submitWhen: [{ field: "draftedBy", is: "Yes", message: "Say Yes" }],
        })
      )
    ).toThrow("is not a select")
  })
})

describe("defineTool, picking one of a table's fixed rows", () => {
  function picking(
    pickOne: { column: string; needs?: string[] },
    fixedRows: Record<string, string>[] = [
      { option: "Standard", fee: "0" },
      { option: "Full" },
    ]
  ): ToolInput {
    return {
      id: "T3.D2.2a",
      name: "Pick",
      workbook: "wb02",
      fields: [
        {
          key: "options",
          label: "Options",
          type: "table",
          fixedRows,
          pickOne,
          columns: [
            { key: "picked", label: "Check One", type: "boolean" },
            { key: "option", label: "Option", type: "text" },
            { key: "fee", label: "Fee", type: "currency" },
          ],
        },
      ],
    }
  }

  it("accepts a yes/no column picked, a column it needs, and a fixed amount", () => {
    expect(
      defineTool(picking({ column: "picked", needs: ["fee"] })).fields[0]
    ).toMatchObject({ pickOne: { column: "picked", needs: ["fee"] } })
  })

  it("refuses a pick in a column that is not yes/no", () => {
    expect(() => defineTool(picking({ column: "option" }))).toThrow(
      "A row is picked in a yes/no column the form writes"
    )
  })

  it("refuses a pick that needs a column the table lacks", () => {
    expect(() =>
      defineTool(picking({ column: "picked", needs: ["notes"] }))
    ).toThrow("notes is not an optional column the form writes")
  })

  it("refuses a fixed amount that is not a number", () => {
    expect(() =>
      defineTool(
        picking({ column: "picked" }, [{ option: "Standard", fee: "free" }])
      )
    ).toThrow(/free.{1,2} is not a number/)
  })

  it("refuses a fixed percentage outside 0 to 100", () => {
    const share = (text: string): ToolInput => ({
      id: "T3.D2.2a",
      name: "Share",
      workbook: "wb02",
      fields: [
        {
          key: "shares",
          label: "Shares",
          type: "table",
          fixedRows: [{ share: text }],
          columns: [{ key: "share", label: "Share", type: "percentage" }],
        },
      ],
    })

    expect(() => defineTool(share("101"))).toThrow(
      "is not a percentage from 0 to 100"
    )
    expect(defineTool(share("100")).fields).toHaveLength(1)
  })
})

describe("defineTool, signing in turn", () => {
  const signature = (key: string): ToolInput["fields"][number] => ({
    key,
    label: key,
    type: "signature",
    signedBy: ["PM"],
  })

  function signed(
    signInTurn: ToolInput["signInTurn"],
    extra: Partial<ToolInput> = {}
  ): ToolInput {
    return {
      id: "T3.D2.2a",
      name: "Signed in turn",
      workbook: "wb02",
      signInTurn,
      fields: [client, signature("first"), signature("second")],
      ...extra,
    }
  }

  it("accepts signatures in turn with an approving one among them", () => {
    expect(
      defineTool(signed({ order: ["first", "second"], approves: "first" }))
        .signInTurn
    ).toEqual({ order: ["first", "second"], approves: "first" })
  })

  it("refuses a turn that is not a signature, or one named twice", () => {
    expect(() =>
      defineTool(signed({ order: ["client"], approves: "client" }))
    ).toThrow("client is not a signature field")
    expect(() =>
      defineTool(signed({ order: ["first", "first"], approves: "first" }))
    ).toThrow("A signature is signed in turn once")
  })

  it("refuses an approving signature that is not signed in turn", () => {
    expect(() =>
      defineTool(signed({ order: ["first"], approves: "second" }))
    ).toThrow("second is not one of the signatures signed in turn")
  })

  it("refuses a tool that locks on submit", () => {
    expect(() =>
      defineTool(
        signed(
          { order: ["first", "second"], approves: "second" },
          { locksOnSubmit: true }
        )
      )
    ).toThrow("A tool signed in turn is submitted, then approved")
  })
})

describe("defineTool, reviews that send work back", () => {
  const review = (extra: Partial<ToolInput> = {}): ToolInput => ({
    id: "D2.3",
    name: "Review",
    workbook: "wb02",
    fields: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Approved", "Revisions Required"],
      },
      {
        key: "next",
        label: "Next Step",
        type: "text",
        systemFilled: true,
        shownFrom: { field: "status", values: { Approved: "Go on" } },
      },
    ],
    ...extra,
  })

  it("takes a text shown from a select's answer", () => {
    expect(defineTool(review()).fields).toHaveLength(2)
  })

  it("refuses a shown text from a field that is not a select, or an option it lacks", () => {
    const [status, next] = review().fields

    expect(() =>
      defineTool(
        review({
          fields: [
            status!,
            // SAFETY: each test changes options a system-filled text takes.
            {
              ...next!,
              shownFrom: { field: "status", values: { Rejected: "Stop" } },
            } as ToolInput["fields"][number],
          ],
        })
      )
    ).toThrow(/Rejected\W+ is not one of status's options/)
    expect(() =>
      defineTool(
        review({
          fields: [
            status!,
            // SAFETY: each test changes options a system-filled text takes.
            {
              ...next!,
              shownFrom: { field: "next", values: { Approved: "Go" } },
            } as ToolInput["fields"][number],
          ],
        })
      )
    ).toThrow("next is not a select of this tool")
  })

  it("refuses a shown text the form would write", () => {
    const [status, next] = review().fields

    expect(() =>
      defineTool(
        review({
          fields: [
            status!,
            // SAFETY: each test changes options a system-filled text takes.
            { ...next!, systemFilled: false } as ToolInput["fields"][number],
          ],
        })
      )
    ).toThrow("A field shown from another field's answer is system-filled text")
  })

  it("sends back on one of a select's options, never itself", () => {
    expect(
      defineTool(
        review({
          sendsBackTo: {
            field: "status",
            is: "Revisions Required",
            tools: ["D2.2"],
          },
        })
      ).sendsBackTo
    ).toEqual({ field: "status", is: "Revisions Required", tools: ["D2.2"] })
    expect(() =>
      defineTool(
        review({
          sendsBackTo: { field: "status", is: "Maybe", tools: ["D2.2"] },
        })
      )
    ).toThrow(/status is not a select with the option/)
    expect(() =>
      defineTool(
        review({
          sendsBackTo: { field: "status", is: "Approved", tools: ["D2.3"] },
        })
      )
    ).toThrow("A tool cannot send itself back")
  })

  it("takes hints for the rows a table with no fixed rows starts with", () => {
    expect(
      withFields([
        {
          key: "rows",
          label: "Rows",
          type: "table",
          columns: [
            {
              key: "note",
              label: "Note",
              type: "text",
              placeholders: ["", "e.g. Section 2.1"],
            },
          ],
        },
      ]).fields
    ).toHaveLength(1)
  })
})

describe("defineTool, signing from a field and answers that decide", () => {
  const route: ToolInput["fields"][number] = {
    key: "route",
    label: "Route",
    type: "select",
    options: ["In app", "On paper"],
  }

  const sentAt: ToolInput["fields"][number] = {
    key: "sentAt",
    label: "Sent at",
    type: "text",
    systemFilled: true,
  }

  function tool(fields: ToolInput["fields"], extra: Partial<ToolInput> = {}) {
    return defineTool({
      id: "D2.11",
      name: "Signed from a field",
      workbook: "wb02",
      fields: [route, sentAt, ...fields],
      ...extra,
    })
  }

  const signature = (
    extra: Partial<
      Extract<ToolInput["fields"][number], { type: "signature" }>
    > = {}
  ): ToolInput["fields"][number] => ({
    key: "clientSignature",
    label: "Client",
    type: "signature",
    signedBy: ["Client"],
    ...extra,
  })

  it("signs from a field the system fills on a draft, and may lock on submit", () => {
    expect(
      tool([signature()], {
        signInTurn: { order: ["clientSignature"], from: "sentAt" },
        locksOnSubmit: true,
      }).signInTurn
    ).toEqual({ order: ["clientSignature"], from: "sentAt" })
  })

  it("refuses to sign from a field the form writes, or one filled on lock", () => {
    expect(() =>
      tool([signature()], {
        signInTurn: { order: ["clientSignature"], from: "route" },
      })
    ).toThrow(
      "route is not a field the system fills while the record is a draft"
    )
    expect(() =>
      tool(
        [
          signature(),
          {
            key: "lockedOn",
            label: "Locked on",
            type: "date",
            systemFilled: true,
            filledOnLock: "lockedAt",
          },
        ],
        { signInTurn: { order: ["clientSignature"], from: "lockedOn" } }
      )
    ).toThrow(
      "lockedOn is not a field the system fills while the record is a draft"
    )
  })

  it("refuses an answer that is not one of the select's options", () => {
    expect(() =>
      tool([signature({ onlyWhen: { field: "route", is: "In ap" } })])
    ).toThrow(/clientSignature waits for route to be .*In ap/)
    expect(() =>
      tool([
        {
          key: "tracker",
          label: "Tracker",
          type: "table",
          readOnlyWhen: { field: "sentAt", is: "In app" },
          columns: [{ key: "status", label: "Status", type: "text" }],
        },
      ])
    ).toThrow(/tracker waits for sentAt to be .*In app/)
  })

  it("keeps a first view only in a field the system fills", () => {
    expect(() => tool([signature({ viewedAs: "route" })])).toThrow(
      "clientSignature keeps its first view in route, which is not a field the system fills"
    )
    expect(
      tool([
        signature({
          viewedAs: "sentAt",
          onlyWhen: { field: "route", is: "In app" },
        }),
      ]).fields
    ).toHaveLength(3)
  })
})
