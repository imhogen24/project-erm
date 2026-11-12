import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { ACCOUNTS_DOC, accountsDoc } from "./accounts-doc"

describe("the test accounts doc", () => {
  it("matches the seed data; run `bun run accounts:doc` after changing it", async () => {
    expect(await readFile(ACCOUNTS_DOC, "utf8")).toBe(await accountsDoc())
  })

  it("names each person's role", async () => {
    const doc = await accountsDoc()

    expect(doc).toMatch(
      /\| Kofi Mensah +\| kofi\.mensah@imhogen\.test +\| IT\/Admin \(Systems support\) +\| Yes +\| Every project +\|/
    )
    expect(doc).toContain("kwaku.ampofo@temafoods.test")
  })
})
