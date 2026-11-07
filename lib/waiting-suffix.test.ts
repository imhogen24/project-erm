import { describe, expect, it } from "vitest"

import { waitingSuffix } from "./waiting-suffix"

describe("waitingSuffix", () => {
  it("6. shows no brackets at zero", () => {
    expect(waitingSuffix(0)).toBe("")
  })

  it("shows the number in brackets after the link's name", () => {
    expect(waitingSuffix(1)).toBe(" (1)")
    expect(waitingSuffix(3)).toBe(" (3)")
  })
})
