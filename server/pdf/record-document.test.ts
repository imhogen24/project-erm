import { describe, expect, it } from "vitest"

import { fileReference } from "@/lib/file-reference"
import { defineTool } from "@/server/tools/define-tool"

import {
  EMPTY,
  sectionsOf,
  textOf,
  uploadIdsOf,
  withLive,
} from "./record-document"

const upload = "0b9c0d3e-5b6a-4d4e-9f43-1d2b3c4d5e6f"

const tool = defineTool({
  id: "D9.9",
  name: "Test Tool",
  workbook: "wb02",
  fields: [
    { key: "client", label: "Client", type: "text", section: "1.0 Metadata" },
    { key: "due", label: "Due", type: "date", section: "1.0 Metadata" },
    { key: "note", label: "Note", type: "longText" },
    { key: "paid", label: "Paid", type: "boolean" },
    {
      key: "costs",
      label: "2.0 Costs",
      type: "table",
      columns: [
        { key: "item", label: "Item", type: "text" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "proof", label: "Proof", type: "fileLink" },
      ],
      subtotal: "amount",
      subtotalLabel: "Total",
    },
    {
      key: "checks",
      label: "3.0 Checks",
      type: "checklist",
      items: ["Scope read", "Budget read"],
    },
    { key: "signOff", label: "Sign-off", type: "signature", signedBy: ["PM"] },
  ],
})

describe("laying out a record", () => {
  it("keeps the tool page's sections, titles and order", () => {
    const sections = sectionsOf(tool, {})

    expect(sections.map((section) => [section.kind, section.title])).toEqual([
      ["rows", "1.0 Metadata"],
      ["rows", "More details"],
      ["table", "2.0 Costs"],
      ["table", "3.0 Checks"],
      ["text", "Sign-off"],
    ])
  })

  it("shows an empty field as a dash and a missing signature as not signed", () => {
    const [metadata, , , , signature] = sectionsOf(tool, {})

    expect(metadata).toMatchObject({
      rows: [
        { label: "Client", value: EMPTY },
        { label: "Due", value: EMPTY },
      ],
    })
    expect(signature).toMatchObject({ text: "Not signed" })
  })

  it("writes each answer as text", () => {
    const sections = sectionsOf(
      tool,
      {
        client: "Acme",
        due: "2026-11-05",
        note: "Two lines\nof text",
        paid: true,
        costs: [
          { item: "Steel", amount: 1200.5, proof: fileReference(upload) },
          { item: "Labour", amount: "300", proof: "https://example.com/a.pdf" },
        ],
        checks: { "Scope read": true },
        signOff: { signedBy: "Pat", signedAt: "2026-11-06T10:00:00.000Z" },
      },
      new Map([[upload, "receipt.pdf"]])
    )

    expect(sections[0]).toMatchObject({
      rows: [
        { label: "Client", value: "Acme" },
        { label: "Due", value: "5 Nov 2026" },
      ],
    })
    expect(sections[1]).toMatchObject({
      rows: [
        { label: "Note", value: "Two lines\nof text" },
        { label: "Paid", value: "Yes" },
      ],
    })
    expect(sections[2]).toEqual({
      kind: "table",
      title: "2.0 Costs",
      columns: ["Item", "Amount", "Proof"],
      rows: [
        ["Steel", "GHS 1,200.50", "receipt.pdf"],
        ["Labour", "GHS 300.00", "https://example.com/a.pdf"],
      ],
      total: ["Total", "GHS 1,500.50", ""],
    })
    expect(sections[3]).toMatchObject({
      rows: [
        ["Scope read", "Yes"],
        ["Budget read", "No"],
      ],
    })
    expect(sections[4]).toMatchObject({ text: "Signed by Pat on 6 Nov 2026" })
  })

  it("shows a table's fixed rows before anything is saved", () => {
    const fixed = defineTool({
      id: "D9.8",
      name: "Fixed",
      workbook: "wb02",
      fields: [
        {
          key: "risks",
          label: "Risks",
          type: "table",
          prefilledRows: ["Scope", "Time"],
          columns: [
            { key: "area", label: "Area", type: "text" },
            { key: "level", label: "Level", type: "text" },
          ],
        },
      ],
    })

    expect(sectionsOf(fixed, {})[0]).toMatchObject({
      rows: [
        ["Scope", EMPTY],
        ["Time", EMPTY],
      ],
    })
  })

  it("names an upload it cannot find as an uploaded file", () => {
    expect(
      textOf({ key: "f", label: "F", type: "fileLink" }, fileReference(upload))
    ).toBe("Uploaded file")
  })

  it("finds the uploads of fields and table cells", () => {
    expect(
      uploadIdsOf(tool, {
        costs: [{ proof: fileReference(upload) }, { proof: "https://x.y/z" }],
      })
    ).toEqual([upload])
  })

  it("lays the live sums over the saved answers", () => {
    expect(
      withLive(
        { total: "", rows: [{ a: "1" }, { a: "2" }] },
        { total: "GHS 3.00", rows: [{ sum: "1" }, { sum: "3" }] }
      )
    ).toEqual({
      total: "GHS 3.00",
      rows: [
        { a: "1", sum: "1" },
        { a: "2", sum: "3" },
      ],
    })
  })
})
