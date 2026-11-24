import { describe, expect, it } from "vitest"

import { pdfResponse } from "./pdf-response"

function disposition(fileName: string, kind: "attachment" | "inline") {
  return pdfResponse(
    { fileName, content: Buffer.from("%PDF-") },
    kind
  ).headers.get("Content-Disposition")
}

describe("sending a PDF", () => {
  it("shows it in the page, or saves it as a file", () => {
    expect(disposition("Company SLA.pdf", "inline")).toBe(
      "inline; filename=\"Company SLA.pdf\"; filename*=UTF-8''Company%20SLA.pdf"
    )
    expect(disposition("Company SLA.pdf", "attachment")).toMatch(/^attachment;/)
  })

  it("keeps the plain name ASCII and escapes what filename* may not hold", () => {
    expect(disposition("Résumé (final) 'v2' *.pdf", "inline")).toBe(
      "inline; filename=\"R_sum_ (final) 'v2' *.pdf\"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%28final%29%20%27v2%27%20%2A.pdf"
    )
  })

  it("is never cached", () => {
    const response = pdfResponse(
      { fileName: "a.pdf", content: Buffer.from("%PDF-") },
      "inline"
    )

    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Content-Type")).toBe("application/pdf")
  })
})
