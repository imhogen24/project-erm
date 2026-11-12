import { expect, test, type Page } from "@playwright/test"

import {
  addUpload,
  d11FilesOf,
  makeClient,
  sidewaysScroll,
  signIn,
  tag,
} from "./support/data"

// UploadThing cannot be reached from a test. It stands in at the two places
// the browser talks to it: the ERM's /api/uploadthing hands out upload
// addresses, and the upload itself answers with what the ERM's callback
// returned. Each file is saved in the database as the real callback saves it.
async function standInForUploadThing(page: Page, personId: string) {
  const saved = new Map<string, { id: string; name: string }>()

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "HEAD, PUT, OPTIONS",
    "access-control-expose-headers": "x-ut-range-start",
  }

  await page.route("**/api/uploadthing?*", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback()
    }

    // SAFETY: UploadThing's client posts the chosen files' names here.
    const { files } = route.request().postDataJSON() as {
      files: { name: string }[]
    }

    const presigned = []

    for (const file of files) {
      const key = `e2e-${tag()}`

      saved.set(key, await addUpload(personId, key, file.name))
      presigned.push({ url: `https://ingest.e2e.test/${key}`, key })
    }

    await route.fulfill({ json: presigned })
  })

  await page.route("https://ingest.e2e.test/**", async (route) => {
    const key = new URL(route.request().url()).pathname.slice(1)

    if (route.request().method() !== "PUT") {
      return route.fulfill({ headers: { ...cors, "x-ut-range-start": "0" } })
    }

    await route.fulfill({
      headers: cors,
      json: {
        url: `https://e2e.ufs.sh/f/${key}`,
        ufsUrl: `https://e2e.ufs.sh/f/${key}`,
        appUrl: `https://e2e.ufs.sh/f/${key}`,
        fileHash: key,
        serverData: saved.get(key),
      },
    })
  })
}

function pdf(name: string) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  }
}

async function fillTier3(page: Page) {
  await page.getByLabel("Organisation").fill("Tarkwa Mines")
  await page
    .getByLabel("Contact person and title")
    .fill("Abena Owusu, Maintenance Lead")
  await page.getByLabel("Email").fill("abena@tarkwa.example")
  await page.getByLabel("Phone").fill("0201234567")
  await page.getByLabel("Project site").fill("Pump station 3, Tarkwa")
  await page.getByLabel("Physical Part / Machine").check()
  await page
    .getByLabel("Asset condition or description")
    .fill("In service, no drawings kept since 2004")
  await page.getByLabel("3D Solid Modeling (STEP/IGES)").check()
  await page.getByLabel("End goal").fill("Spare parts drawings")
  await page.getByLabel("ISO").check()
  await page.getByLabel("PDF", { exact: true }).check()
}

function attached(page: Page) {
  return page
    .getByRole("list", { name: "Attached files" })
    .getByRole("listitem")
}

test("a client attaches files, removes one, and D1.1 lists the rest by name", async ({
  page,
}) => {
  const client = await makeClient()

  await standInForUploadThing(page, client.id)
  await signIn(page, client.email)
  await page.goto("/projects/new?tier=Tier_3")

  await fillTier3(page)
  await page
    .getByLabel("Reference uploads")
    .setInputFiles([pdf("pump casing.pdf"), pdf("old drawing.pdf")])

  await expect(attached(page)).toHaveText([
    "pump casing.pdf",
    "old drawing.pdf",
  ])

  await page.getByRole("button", { name: "Remove old drawing.pdf" }).click()
  await expect(attached(page)).toHaveText(["pump casing.pdf"])

  await page.getByRole("button", { name: "Send request" }).click()
  await page.waitForURL(/\/projects\/[0-9a-f-]+$/)

  const projectId = page.url().split("/").pop()!

  expect(await d11FilesOf(projectId)).toEqual([
    expect.objectContaining({
      label: "pump casing.pdf",
      fileLink: expect.stringMatching(/^file:[0-9a-f-]+$/),
    }),
  ])

  await page.goto(`/projects/${projectId}/tools/D1.1`)
  await expect(page.getByText("pump casing.pdf")).toBeVisible()
  await expect(page.getByRole("link", { name: /^Open file/ })).toHaveCount(1)
})

test("a refused upload says what to send instead and lists nothing", async ({
  page,
}) => {
  const client = await makeClient()

  await page.route("**/api/uploadthing?*", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 400, json: { message: "Invalid file type" } })
      : route.fallback()
  )
  await signIn(page, client.email)
  await page.goto("/projects/new?tier=Tier_3")

  await page.getByLabel("Reference uploads").setInputFiles([pdf("big.pdf")])

  await expect(
    page.getByText("Use images or PDFs of 16MB or less")
  ).toBeVisible()
  await expect(attached(page)).toHaveCount(0)
})

test("at 375px the files list fits and nothing scrolls sideways", async ({
  page,
}) => {
  const client = await makeClient()

  await page.setViewportSize({ width: 375, height: 800 })
  await standInForUploadThing(page, client.id)
  await signIn(page, client.email)
  await page.goto("/projects/new?tier=Tier_3")

  await page
    .getByLabel("Reference uploads")
    .setInputFiles([
      pdf(
        "a very long file name for the pump station casing drawing revision c.pdf"
      ),
    ])

  await expect(attached(page)).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Add files" })).toBeVisible()
  expect(await sidewaysScroll(page)).toBe(0)
})
