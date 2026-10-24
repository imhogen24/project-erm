import { describe, expect, it } from "vitest"

import type { JsonObject } from "@/db/schema"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

import { ValidationError, assertValid, validateRecord } from "./validate"

const OPERANDS = ["Material", "Energy", "Information", "Living thing"]

// One tool with every wider field type, so each can be checked on its own.
tools.registerTool(
  defineTool({
    id: "TEST.WIDE",
    name: "Every wider field type",
    workbook: "test",
    fields: [
      {
        key: "submissions",
        label: "Submissions",
        type: "table",
        required: true,
        columns: [
          { key: "client", label: "Client", type: "text" },
          { key: "dateSubmitted", label: "Date submitted", type: "date" },
          { key: "share", label: "Share", type: "percentage" },
          { key: "cost", label: "Cost", type: "currency" },
          {
            key: "reference",
            label: "Reference",
            type: "text",
            inherited: { tool: "D1.1", field: "clientName" },
          },
        ],
        subtotal: "cost",
      },
      {
        key: "operands",
        label: "Operands",
        type: "table",
        columns: [
          {
            key: "operand",
            label: "Operand",
            type: "select",
            options: OPERANDS,
          },
          { key: "input", label: "Input", type: "text" },
        ],
        prefilledRows: OPERANDS,
      },
      {
        key: "triage",
        label: "Triage",
        type: "checklist",
        required: true,
        items: ["Readable", "Aligned", "Valid contact"],
      },
      { key: "budget", label: "Budget", type: "currency" },
      { key: "markup", label: "Markup", type: "percentage" },
      { key: "senderEmail", label: "Sender email", type: "email" },
      { key: "timeReceived", label: "Time received", type: "time" },
      { key: "emailLink", label: "Email link", type: "fileLink" },
      { key: "pmSignature", label: "PM signature", type: "signature" },
      {
        key: "clientReference",
        label: "Client reference",
        type: "text",
        inherited: { tool: "D1.1", field: "clientName" },
      },
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
    ],
  })
)

function check(payload: JsonObject, forSubmit = false) {
  return validateRecord("TEST.WIDE", payload, { forSubmit })
}

function errorsOf(payload: JsonObject, forSubmit = false) {
  const validation = check(payload, forSubmit)

  if (validation.ok) {
    throw new Error("The payload was accepted, but it should have been refused")
  }

  return validation.errors
}

function fieldsOf(payload: JsonObject, forSubmit = false) {
  return errorsOf(payload, forSubmit)
    .map((error) => error.field)
    .sort()
}

const OPERAND_ROWS = OPERANDS.map((operand) => ({ operand, input: "" }))

const FILLED = {
  submissions: [{ client: "Acme", dateSubmitted: "2026-10-01", cost: 100 }],
  operands: OPERAND_ROWS,
  triage: { Readable: true, Aligned: true, "Valid contact": false },
}

describe("a table", () => {
  it("accepts rows whose cells match their columns", () => {
    expect(check(FILLED, true).ok).toBe(true)
  })

  it("names the row, the column and the problem for a bad cell", () => {
    const errors = errorsOf({
      submissions: [
        { client: "Acme", dateSubmitted: "2026-10-01" },
        { client: "Beta", dateSubmitted: "1st October" },
      ],
    })

    expect(errors).toEqual([
      {
        field: "submissions",
        row: 1,
        column: "dateSubmitted",
        message: "Must be a date (YYYY-MM-DD)",
      },
    ])
  })

  it("refuses a cell for a column the table does not have", () => {
    expect(errorsOf({ submissions: [{ client: "Acme", budget: 4 }] })).toEqual([
      {
        field: "submissions",
        row: 0,
        column: "budget",
        message: "Not a column of this table",
      },
    ])
  })

  it("refuses a row that is not a set of cells", () => {
    expect(errorsOf({ submissions: ["Acme"] })).toMatchObject([
      { field: "submissions", row: 0 },
    ])
  })

  it("refuses a value that is not a list of rows", () => {
    expect(fieldsOf({ submissions: "Acme" })).toEqual(["submissions"])
  })

  it("refuses a value for an inherited column", () => {
    expect(
      errorsOf({ submissions: [{ client: "Acme", reference: "Acme" }] })
    ).toMatchObject([{ field: "submissions", row: 0, column: "reference" }])
  })

  it("names the row in the text of a ValidationError", () => {
    expect(() =>
      assertValid(
        "TEST.WIDE",
        { submissions: [{}, { dateSubmitted: "soon" }] },
        { forSubmit: false }
      )
    ).toThrow(
      new ValidationError([
        {
          field: "submissions",
          row: 1,
          column: "dateSubmitted",
          message: "Must be a date (YYYY-MM-DD)",
        },
      ])
    )
    expect(
      new ValidationError([
        {
          field: "submissions",
          row: 1,
          column: "dateSubmitted",
          message: "Bad",
        },
      ]).message
    ).toBe("submissions, row 2, dateSubmitted: Bad")
  })
})

describe("a required table", () => {
  it("is refused at submit when it has no rows", () => {
    expect(fieldsOf({ ...FILLED, submissions: [] }, true)).toEqual([
      "submissions",
    ])
  })

  it("is accepted with no rows as a draft", () => {
    expect(check({ ...FILLED, submissions: [] }).ok).toBe(true)
  })
})

describe("a table with prefilled rows", () => {
  it("accepts the rows with their labels intact", () => {
    expect(check({ operands: OPERAND_ROWS }).ok).toBe(true)
  })

  it("refuses the rows with one removed", () => {
    expect(fieldsOf({ operands: OPERAND_ROWS.slice(1) })).toEqual(["operands"])
  })

  it("refuses the rows with one added", () => {
    expect(
      fieldsOf({ operands: [...OPERAND_ROWS, { operand: "Material" }] })
    ).toEqual(["operands"])
  })

  it("refuses a changed label, and names its row", () => {
    const rows = OPERAND_ROWS.map((row, index) =>
      index === 2 ? { ...row, operand: "Energy" } : row
    )

    expect(errorsOf({ operands: rows })).toMatchObject([
      { field: "operands", row: 2, column: "operand" },
    ])
  })

  it("refuses rows in a different order", () => {
    expect(fieldsOf({ operands: [...OPERAND_ROWS].reverse() })).toContain(
      "operands"
    )
  })
})

describe("a checklist", () => {
  it("refuses an item that is not in its list", () => {
    expect(
      errorsOf({ triage: { Readable: true, "Free of malware": true } })
    ).toEqual([
      {
        field: "triage",
        message: 'Not an item of this checklist: "Free of malware"',
      },
    ])
  })

  it("refuses an answer that is not yes or no", () => {
    expect(fieldsOf({ triage: { Readable: "pass" } })).toEqual(["triage"])
  })

  it("accepts a partial checklist as a draft", () => {
    expect(check({ triage: { Readable: true } }).ok).toBe(true)
  })

  it("is refused at submit, when required, until every item is answered", () => {
    expect(
      fieldsOf({ ...FILLED, triage: { Readable: true, Aligned: false } }, true)
    ).toEqual(["triage"])
  })
})

describe("currency and percentage", () => {
  it("refuses text in a currency field and in a currency cell", () => {
    expect(
      errorsOf({ budget: "100 GHS", submissions: [{ cost: "100 GHS" }] })
    ).toEqual([
      {
        field: "submissions",
        row: 0,
        column: "cost",
        message: "Must be an amount",
      },
      { field: "budget", message: "Must be an amount" },
    ])
  })

  it("refuses 120 in a percentage field and in a percentage cell", () => {
    expect(errorsOf({ markup: 120, submissions: [{ share: 120 }] })).toEqual([
      {
        field: "submissions",
        row: 0,
        column: "share",
        message: "Must be a percentage from 0 to 100",
      },
      { field: "markup", message: "Must be a percentage from 0 to 100" },
    ])
  })

  it("accepts 0 and 100 as percentages, and a decimal amount", () => {
    expect(check({ markup: 0, budget: 12.5 }).ok).toBe(true)
    expect(check({ markup: 100 }).ok).toBe(true)
  })
})

describe("email, time and file link", () => {
  it("refuses a malformed email and a malformed time", () => {
    expect(
      fieldsOf({ senderEmail: "ops at acme", timeReceived: "9am" })
    ).toEqual(["senderEmail", "timeReceived"])
  })

  it("refuses a time out of range", () => {
    expect(fieldsOf({ timeReceived: "25:00" })).toEqual(["timeReceived"])
  })

  it("accepts a well formed email and time", () => {
    expect(
      check({ senderEmail: "ops@acme.com", timeReceived: "09:30" }).ok
    ).toBe(true)
  })

  it("accepts a web link, and refuses anything else as a file link", () => {
    expect(check({ emailLink: "https://drive.example.com/f/1" }).ok).toBe(true)

    for (const emailLink of ["drive/f/1", "javascript:alert(1)"]) {
      expect(fieldsOf({ emailLink })).toEqual(["emailLink"])
    }
  })
})

describe("fields the user never writes", () => {
  it("refuses a signature with the same message as an inherited field", () => {
    const errors = errorsOf({
      pmSignature: { signedBy: "Ama", signedAt: "2026-10-01T09:00:00Z" },
      clientReference: "Acme",
    })

    expect(errors).toHaveLength(2)
    expect(errors[0]!.message).toBe(errors[1]!.message)
  })

  it.each(["script", "exclusions"])("refuses a value for %s", (key) => {
    expect(fieldsOf({ [key]: "Hello" })).toEqual([key])
  })
})
