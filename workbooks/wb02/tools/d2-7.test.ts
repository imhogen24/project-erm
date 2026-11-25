import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { scriptFor } from "@/lib/transmittal"
import {
  EmailRefusedError,
  SendNotReadyError,
} from "@/server/acknowledgement/acknowledgement"
import {
  sendTransmittal,
  sendTransmittalFollowUps,
  sentEmailOf,
  transmittalStart,
  transmittalValues,
} from "@/server/contract/transmittal"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { previewStates } from "@/server/pdf/previews"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  getRecord,
  saveDraft,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d21 } from "./d2-1"
import { d22 } from "./d2-2"
import { d23 } from "./d2-3"
import { d24 } from "./d2-4"
import { d25 } from "./d2-5"
import { d26 } from "./d2-6"
import { d27 } from "./d2-7"
import { d28 } from "./d2-8"
import { d29 } from "./d2-9"
import { d210 } from "./d2-10"
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

for (const tool of [
  d21,
  d22,
  t3d22a,
  d23,
  d24,
  d25,
  d26,
  d27,
  d28,
  d29,
  d210,
]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

const SENT_AT = new Date("2026-11-20T10:30:00Z")

const DAY = 24 * 60 * 60 * 1000

let projectId: string

let ca: string

let transport: FakeTransport

async function addProject(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [
      requestId,
      track,
      rows[0]!.id,
      { organization_name: "Asante Mills", email: CLIENT_EMAIL },
    ]
  )

  return rows[0]!.id
}

async function addPerson(name: string, held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@imhogen.test`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z') RETURNING id",
    [projectId, toolId, payload]
  )

  return rows[0]!.id
}

// Everything before D2.7 locked, so it is open.
async function reachTransmittal(draftTool = "D2.2") {
  await addRecord("D1.16")
  await addRecord("D2.1")
  await addRecord(draftTool)
  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })
  await addRecord("D2.5", {
    executiveDecision: "Approved for Client Transmission",
  })
  await addRecord("D2.6")
}

function ready(values: JsonObject = {}): JsonObject {
  return {
    ccBcc: "legal@asantemills.test",
    quoteExpiry: "2026-12-20",
    script: "Dear Asante Mills\n\nPlease find the draft attached.",
    followUpScheduled: "Yes",
    initialResponse: "Pending",
    ...values,
  }
}

async function draft(values = ready()) {
  return saveDraft(database, ca, {
    projectId,
    toolId: "D2.7",
    cycle: 1,
    values,
  })
}

async function send(id: string, via: Transport = transport, now = SENT_AT) {
  return sendTransmittal(database, ca, id, { transport: via, now })
}

beforeEach(async () => {
  await resetTestData(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")

  transport = createFakeTransport()
  projectId = await addProject()
  ca = await addPerson("Gifty Ofori", ["CA"])

  await addRecord("D1.15", { budget: [{ value: 60000 }] })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens once D2.6 is locked", async () => {
    await addRecord("D1.16")
    await addRecord("D2.1")
    await addRecord("D2.2")
    await addRecord("D2.3", { operationalStatus: "Approved" })
    await addRecord("D2.4", { commercialStatus: "Approved" })
    await addRecord("D2.5", {
      executiveDecision: "Approved for Client Transmission",
    })

    const open = async () =>
      (await availableTools(database, projectId)).map((each) => each.toolId)

    expect(await open()).not.toContain("D2.7")

    await addRecord("D2.6")

    expect(await open()).toContain("D2.7")
  })
})

describe("where it starts", () => {
  it("starts the quote 30 days on, the script naming client and project, and no reply", async () => {
    expect(
      await transmittalStart(
        database,
        projectId,
        new Date("2026-11-25T12:00:00Z")
      )
    ).toEqual({
      quoteExpiry: "2026-12-25",
      script: scriptFor("Asante Mills", "Rice Mill"),
      initialResponse: "Pending",
    })
  })

  it("keeps the sheet's script word for word, cut-short sentence and all", () => {
    const script = scriptFor("Asante Mills", "Rice Mill")

    expect(script).toContain(
      "Due to current fluctuations in material supply chains\nIf the terms meet your expectations,we are happy"
    )
    expect(script.startsWith("Dear Asante Mills\n\n")).toBe(true)
  })

  it("shows the client's email and the fixed subject until it is sent", async () => {
    expect(await transmittalValues(database, projectId, {})).toEqual({
      sentTo: CLIENT_EMAIL,
      subject: "IMHO GEN Engineering Services Agreement - Rice Mill",
    })
    expect(
      await transmittalValues(database, projectId, { sentBy: "Gifty Ofori" })
    ).toEqual({})
  })

  it("previews D2.2 as the file attached, and T3.D2.2a on Tier 3", async () => {
    await reachTransmittal()

    expect(
      (await previewStates(database, ca, projectId, d27)).fileAttached
    ).toMatchObject({ status: "ready", name: "D2.2 Initial Draft Contract" })

    projectId = await addProject("Tier_3")
    ca = await addPerson("Kofi Ofori", ["CA"])
    await reachTransmittal("T3.D2.2a")

    expect(
      (await previewStates(database, ca, projectId, d27)).fileAttached
    ).toMatchObject({
      status: "ready",
      name: "T3.D2.2a T3 Drafting Contract Mapping",
    })
  })
})

describe("sending", () => {
  beforeEach(async () => {
    await reachTransmittal()
  })

  it("emails the client once, copying CC, with the draft contract's PDF attached", async () => {
    const record = await draft()

    const sent = await send(record.id)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe(CLIENT_EMAIL)
    expect(email.cc).toEqual(["legal@asantemills.test"])
    expect(email.subject).toBe(
      "IMHO GEN Engineering Services Agreement - Rice Mill"
    )
    expect(email.text).toBe(ready().script)
    expect(email.attachments).toEqual([
      expect.objectContaining({
        filename: expect.stringMatching(
          /^D2\.2 Initial Draft Contract.*\.pdf$/
        ),
        contentType: "application/pdf",
        encoding: "base64",
      }),
    ])
    expect(
      Buffer.from(email.attachments![0]!.content, "base64")
        .subarray(0, 4)
        .toString()
    ).toBe("%PDF")

    expect(sent.state).toBe("draft")
    expect(sent.payload).toMatchObject({
      sentTo: CLIENT_EMAIL,
      sentBy: "Gifty Ofori",
      subject: "IMHO GEN Engineering Services Agreement - Rice Mill",
      dateSent: "2026-11-20",
      timeSent: "10:30",
      followUpDate: "2026-11-23",
      sentEmailLink: `/projects/${projectId}/tools/D2.7/sent-email`,
    })

    await expect(send(record.id)).rejects.toThrow("already been sent")
    expect(transport.sent).toHaveLength(1)
  })

  it("sends one email when Send is pressed twice at once", async () => {
    const record = await draft()

    await Promise.allSettled([send(record.id), send(record.id)])

    expect(transport.sent).toHaveLength(1)
    expect((await getRecord(database, ca, record.id)).payload.dateSent).toBe(
      "2026-11-20"
    )
  })

  it("keeps a copy of the email as it went out", async () => {
    const record = await draft()

    await send(record.id)

    expect(await sentEmailOf(database, record.id)).toMatchObject({
      to: CLIENT_EMAIL,
      cc: ["legal@asantemills.test"],
      subject: "IMHO GEN Engineering Services Agreement - Rice Mill",
      text: ready().script,
      attachments: [expect.stringMatching(/^D2\.2 Initial Draft Contract/)],
    })
  })

  it("leaves the follow-up date empty when no follow-up is wanted", async () => {
    const record = await draft(ready({ followUpScheduled: "No" }))

    expect((await send(record.id)).payload.followUpDate).toBeUndefined()
  })

  it("is refused until the script and the follow-up choice are in", async () => {
    // No follow-up chosen, and the script emptied.
    const unchosen = Object.fromEntries(
      Object.entries(ready({ script: "" })).filter(
        ([key]) => key !== "followUpScheduled"
      )
    )

    const record = await draft(unchosen)

    await expect(send(record.id)).rejects.toMatchObject({
      missing: [
        "add the email script",
        "choose whether to follow up after 3 days",
      ],
    })
    await expect(send(record.id)).rejects.toThrow(SendNotReadyError)
    expect(transport.sent).toHaveLength(0)
  })

  it("marks nothing sent when the email service refuses, so the CA can send again", async () => {
    const record = await draft()

    const failing: Transport = {
      name: "failing",
      send: async () => {
        throw new Error("Resend is down")
      },
    }

    await expect(send(record.id, failing)).rejects.toThrow(EmailRefusedError)
    expect(
      (await getRecord(database, ca, record.id)).payload.dateSent
    ).toBeUndefined()

    await send(record.id)

    expect(transport.sent).toHaveLength(1)
  })

  it("refuses an edit saved while the email is going out", async () => {
    const record = await draft()

    let edit: Promise<unknown> | undefined

    const slow: Transport = {
      name: "slow",
      send: async (message) => {
        edit = updateRecord(
          database,
          ca,
          record.id,
          ready({ script: "Changed while sending" })
        )

        await edit.catch(() => undefined)

        return transport.send(message, { idempotencyKey: "slow" })
      },
    }

    await send(record.id, slow)

    await expect(edit).rejects.toThrow(ValidationError)
    expect((await getRecord(database, ca, record.id)).payload.script).toBe(
      ready().script
    )
  })

  it("lets nobody but the CA send", async () => {
    const pm = await addPerson("Ama Owusu", ["PM"])
    const record = await draft()

    await expect(
      sendTransmittal(database, pm, record.id, { transport })
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("keeps what was sent, while the reply can still change", async () => {
    const record = await draft()

    await send(record.id)

    await expect(
      updateRecord(database, ca, record.id, ready({ script: "Changed" }))
    ).rejects.toThrow(ValidationError)

    await expect(
      updateRecord(database, ca, record.id, ready({ followUpScheduled: "No" }))
    ).rejects.toThrow(ValidationError)

    const answered = await updateRecord(
      database,
      ca,
      record.id,
      ready({ initialResponse: "Requested Negotiation" })
    )

    expect(answered.payload).toMatchObject({
      script: ready().script,
      initialResponse: "Requested Negotiation",
      dateSent: "2026-11-20",
    })
  })
})

describe("submitting", () => {
  beforeEach(async () => {
    await reachTransmittal()
  })

  it("is refused before sending, and while the reply is Pending", async () => {
    const record = await draft()

    await expect(submitRecord(database, ca, record.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "sentBy" }),
        {
          field: "initialResponse",
          message: "Record the client's reply before submitting",
        },
      ]),
    })

    await send(record.id)

    await expect(submitRecord(database, ca, record.id)).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: "initialResponse" })],
    })
  })

  it("locks once sent and the client has answered", async () => {
    const record = await draft()

    await send(record.id)
    await updateRecord(
      database,
      ca,
      record.id,
      ready({ initialResponse: "Accepted as-is" })
    )

    expect((await submitRecord(database, ca, record.id)).state).toBe("locked")
  })
})

describe("the follow-up", () => {
  beforeEach(async () => {
    await reachTransmittal()
  })

  async function sentWith(values: JsonObject = {}) {
    const record = await draft(ready(values))

    await send(record.id)

    return record.id
  }

  const after = (days: number) => new Date(SENT_AT.getTime() + days * DAY)

  it("reminds the client once after 3 days with no reply, and tells the CA", async () => {
    await sentWith()

    expect(
      await sendTransmittalFollowUps(database, { transport, now: after(2.9) })
    ).toBe(0)
    expect(
      await sendTransmittalFollowUps(database, { transport, now: after(3) })
    ).toBe(1)
    expect(
      await sendTransmittalFollowUps(database, { transport, now: after(4) })
    ).toBe(0)

    const reminders = transport.sent.filter((email) =>
      email.subject.startsWith("Re: ")
    )

    expect(reminders).toHaveLength(1)
    expect(reminders[0]!.to).toBe(CLIENT_EMAIL)
    expect(
      transport.sent.filter((email) => email.to === "gifty.ofori@imhogen.test")
    ).toHaveLength(1)
    expect(
      (await listNotifications(database, ca)).map((each) => each.title)
    ).toContain("The client was reminded about the draft contract")
  })

  it("tells the CA on a later run when their email failed, without reminding the client again", async () => {
    await sentWith()

    const toCa = (email: { to: string }) =>
      email.to === "gifty.ofori@imhogen.test"

    const flaky: Transport = {
      name: "flaky",
      send: async (message, options) => {
        if (toCa(message)) {
          throw new Error("Resend is down")
        }

        return transport.send(message, options)
      },
    }

    await sendTransmittalFollowUps(database, {
      transport: flaky,
      now: after(3),
    })
    await sendTransmittalFollowUps(database, { transport, now: after(3.1) })

    expect(
      transport.sent.filter((email) => email.subject.startsWith("Re: "))
    ).toHaveLength(1)
    expect(transport.sent.filter(toCa)).toHaveLength(1)
    expect(
      (await listNotifications(database, ca)).filter(
        (each) =>
          each.title === "The client was reminded about the draft contract"
      )
    ).toHaveLength(1)
  })

  it("sends nothing once the client has answered", async () => {
    const id = await sentWith()

    await updateRecord(
      database,
      ca,
      id,
      ready({ initialResponse: "Accepted as-is" })
    )

    expect(
      await sendTransmittalFollowUps(database, { transport, now: after(5) })
    ).toBe(0)
  })

  it("sends nothing when no follow-up was asked for", async () => {
    await sentWith({ followUpScheduled: "No" })

    expect(
      await sendTransmittalFollowUps(database, { transport, now: after(5) })
    ).toBe(0)
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM, CR and client read it, and nobody else see it", async () => {
    const readers = [
      await addPerson("Ama Owusu", ["PM"]),
      await addPerson("Yaw Boateng", ["CR"]),
      await addPerson("Akosua Client", ["Client"]),
    ]

    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, ca, projectId, "D2.7", "write")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.7", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.7", "write")).toBe(
        false
      )
    }

    expect(await can(database, om, projectId, "D2.7", "read")).toBe(false)
  })
})
