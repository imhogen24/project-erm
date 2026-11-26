import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { inviteScriptFor } from "@/lib/negotiation-invite"
import {
  InviteNotReadyError,
  InviteRefusedError,
  hardLimitsOf,
  negotiationInviteStart,
  negotiationInviteValues,
  sendNegotiationInvite,
} from "@/server/contract/negotiation-invite"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import { previewStates } from "@/server/pdf/previews"
import { recordContent } from "@/server/pdf/record-pdf"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  getRecord,
  saveDraft,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { toolAsShown } from "@/server/records/shown-fields"
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
import { d211 } from "./d2-11"
import { d212 } from "./d2-12"
import { d213 } from "./d2-13"
import { d214 } from "./d2-14"
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
  d211,
  d212,
  d213,
  d214,
]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

const NOW = new Date("2026-11-25T09:00:00Z")

const CONCERN = "[Insert 1-2 words on their concern,e.g.,the delivery timeline]"

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
      {
        organization_name: "Asante Mills",
        contact_person: "Kwaku Ampofo",
        email: CLIENT_EMAIL,
      },
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

const baseline: JsonObject = {
  baseline: [
    {
      variable: "Total Contract Value (GHS)",
      baselineValue: "GHS 94,400.00",
      absoluteLimit: "GHS 90,000.00",
    },
    {
      variable: "Advance Payment %",
      baselineValue: "40%",
      absoluteLimit: "Absolute minimum 35% to cover initial BOM",
    },
    {
      variable: "Total Project Timeline",
      baselineValue: "8 weeks",
      absoluteLimit: "",
    },
  ],
}

// Everything before D2.8 locked, D2.7 with the client's reply.
async function reachInvite(reply = "Requested Negotiation") {
  await addRecord("D1.16")
  await addRecord("D2.1")
  await addRecord("D2.2")
  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })
  await addRecord("D2.5", {
    executiveDecision: "Approved for Client Transmission",
  })
  await addRecord("D2.6", baseline)
  await addRecord("D2.7", { initialResponse: reply })
}

const script = inviteScriptFor("Asante Mills", "Rice Mill").replace(
  CONCERN,
  "the delivery timeline"
)

function ready(values: JsonObject = {}): JsonObject {
  return {
    proposedDate: "2026-12-01",
    meetingTime: "10:00",
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    imhogenReps: "Lead PM & Head of R&D",
    clientReps: "Kwaku Ampofo",
    clientConcerns: "Wants the timeline cut to 6 weeks.",
    hardLimits: "Total Project Timeline: no less than 7 weeks",
    script,
    clientConfirmed: "No",
    preMeetHeld: "No",
    readyForMeeting: "No",
    ...values,
  }
}

async function draft(values = ready()) {
  return saveDraft(database, ca, {
    projectId,
    toolId: "D2.8",
    cycle: 1,
    values,
  })
}

async function send(id: string, via: Transport = transport, now = NOW) {
  return sendNegotiationInvite(database, ca, id, { transport: via, now })
}

function icsOf(index: number) {
  return String(transport.sent[index]!.attachments![0]!.content)
}

beforeEach(async () => {
  await resetTestData(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

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
  const open = async () =>
    (await availableTools(database, projectId)).map((each) => each.toolId)

  it("opens once D2.7 locks with Requested Negotiation", async () => {
    await reachInvite()

    expect(await open()).toContain("D2.8")
  })

  it("does not open when the client accepted the draft as it is", async () => {
    await reachInvite("Accepted as-is")

    expect(await open()).not.toContain("D2.8")
  })
})

describe("where it starts", () => {
  it("starts from the sheet's script naming client and project, and D2.6's limits", async () => {
    await reachInvite()

    const start = await negotiationInviteStart(database, projectId)

    expect(start).toEqual({
      script: inviteScriptFor("Asante Mills", "Rice Mill"),
      hardLimits: [
        "Total Contract Value (GHS): GHS 90,000.00",
        "Advance Payment %: Absolute minimum 35% to cover initial BOM",
      ].join("\n"),
    })
    expect(String(start.script)).toMatch(/^Dear Asante Mills\n\n/)
    expect(String(start.script)).toContain(
      "Draft Engineering Services Agreement for Rice Mill."
    )
  })

  it("leaves out a row with no limit", () => {
    expect(hardLimitsOf({ baseline: [{ variable: "Warranty" }] })).toBe("")
    expect(hardLimitsOf({})).toBe("")
  })

  it("shows the request ID, and whether the invite has gone", async () => {
    const [project] = (
      await database.pool.query<{ request_id: string }>(
        "SELECT request_id FROM projects WHERE id = $1",
        [projectId]
      )
    ).rows

    expect(await negotiationInviteValues(database, projectId, {})).toEqual({
      requestId: project!.request_id,
      inviteSent: "No",
    })
    expect(
      (
        await negotiationInviteValues(database, projectId, {
          inviteSentAt: NOW.toISOString(),
        })
      ).inviteSent
    ).toBe("Yes")
  })

  it("previews D2.6 as the reference document", async () => {
    await reachInvite()

    expect(
      (await previewStates(database, ca, projectId, d28)).referenceDocument
    ).toMatchObject({ status: "ready", name: "D2.6 Internally Approved Draft" })
  })
})

describe("sending the calendar invite", () => {
  let client: string

  beforeEach(async () => {
    await reachInvite()
    client = await addPerson("Akosua Client", ["Client"])
  })

  it("emails the client and the CA once, with the script and a calendar file", async () => {
    const record = await draft()

    const sent = await send(record.id)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe(CLIENT_EMAIL)
    expect(email.cc).toEqual([
      "akosua.client@imhogen.test",
      "gifty.ofori@imhogen.test",
    ])
    expect(email.subject).toMatch(/^Contract Alignment Meeting: Rice Mill \[/)
    expect(email.text).toMatch(
      /Please let us know if Tue,? 1 Dec 2026, 10:00 GMT works for your team\./
    )
    expect(email.text).toContain(
      "Where: Google Meet: https://meet.google.com/abc-defg-hij"
    )
    expect(email.attachments![0]!.filename).toBe("invite.ics")
    expect(icsOf(0)).toContain("DTSTART:20261201T100000Z")
    expect(icsOf(0)).toContain("DTEND:20261201T103000Z")
    expect(icsOf(0)).toContain(`UID:${record.id}@erm.imhogen`)
    expect(icsOf(0)).toContain("SEQUENCE:0")

    // The script now shows the date and time, and the invite reads as sent.
    expect(sent.payload.script).toMatch(
      /Please let us know if Tue,? 1 Dec 2026, 10:00 GMT works/
    )
    expect(sent.payload.inviteSentAt).toBe(NOW.toISOString())
    expect(
      (await negotiationInviteValues(database, projectId, sent.payload))
        .inviteSent
    ).toBe("Yes")

    // Pressed again, the same invite is not sent twice.
    await send(record.id)
    expect(transport.sent).toHaveLength(1)
  })

  it("sends one invite when Send is pressed twice at once", async () => {
    const record = await draft()

    await Promise.allSettled([send(record.id), send(record.id)])

    expect(transport.sent).toHaveLength(1)
  })

  it("sends an update to the same meeting after 1.0 changes", async () => {
    const record = await draft()
    const sent = await send(record.id)

    const changed = await updateRecord(database, ca, record.id, {
      ...ready({ meetingTime: "14:30" }),
      script: sent.payload.script ?? null,
    })

    const updated = await send(changed.id)

    expect(transport.sent).toHaveLength(2)
    expect(icsOf(1)).toContain(`UID:${record.id}@erm.imhogen`)
    expect(icsOf(1)).toContain("SEQUENCE:1")
    expect(icsOf(1)).toContain("DTSTART:20261201T143000Z")
    expect(updated.payload.script).toMatch(
      /if Tue,? 1 Dec 2026, 14:30 GMT works/
    )
    expect(updated.payload.script).not.toContain("10:00 GMT")
  })

  it("is refused while 1.0 is missing its date, time or platform", async () => {
    const record = await draft(
      Object.fromEntries(
        Object.entries(ready()).filter(
          ([key]) => !["proposedDate", "meetingTime", "platform"].includes(key)
        )
      )
    )

    await expect(send(record.id)).rejects.toMatchObject({
      missing: [
        "add the proposed date",
        "add the meeting time",
        "add the platform or location",
      ],
    })
    await expect(send(record.id)).rejects.toThrow(InviteNotReadyError)
    expect(transport.sent).toHaveLength(0)
  })

  it("is refused while the script still holds the concern in brackets", async () => {
    const record = await draft(
      ready({ script: inviteScriptFor("Asante Mills", "Rice Mill") })
    )

    await expect(send(record.id)).rejects.toMatchObject({
      missing: [`replace ${CONCERN} in the script`],
    })
    expect(transport.sent).toHaveLength(0)
  })

  it("is refused for a time that has passed", async () => {
    const record = await draft(ready({ proposedDate: "2026-11-24" }))

    await expect(send(record.id)).rejects.toMatchObject({
      missing: ["the proposed time has passed; choose a later one"],
    })
  })

  it("marks nothing sent when the email service refuses, so the CA can send again", async () => {
    const record = await draft()

    const failing: Transport = {
      name: "failing",
      send: async () => {
        throw new Error("Resend is down")
      },
    }

    await expect(send(record.id, failing)).rejects.toThrow(InviteRefusedError)

    const after = await getRecord(database, ca, record.id)

    expect(after.payload.inviteSentAt).toBeUndefined()
    expect(after.payload.script).toBe(script)

    await send(record.id)

    expect(transport.sent).toHaveLength(1)
  })

  it("keeps the script as sent", async () => {
    const record = await draft()

    await send(record.id)

    await expect(
      updateRecord(database, ca, record.id, ready({ script: "Changed" }))
    ).rejects.toThrow(ValidationError)
  })

  it("lets nobody but the CA send", async () => {
    const pm = await addPerson("Ama Owusu", ["PM"])
    const record = await draft()

    await expect(
      sendNegotiationInvite(database, pm, record.id, { transport, now: NOW })
    ).rejects.toThrow(PermissionDeniedError)
    await expect(
      sendNegotiationInvite(database, client, record.id, {
        transport,
        now: NOW,
      })
    ).rejects.toThrow(PermissionDeniedError)
  })
})

describe("submitting", () => {
  beforeEach(async () => {
    await reachInvite()
  })

  it("is refused before the invite is sent, and while a 4.0 answer is No", async () => {
    const record = await draft()

    await expect(submitRecord(database, ca, record.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "inviteSentAt" }),
        {
          field: "clientConfirmed",
          message: "Answer Yes once the client has confirmed the meeting",
        },
        expect.objectContaining({ field: "preMeetHeld" }),
        expect.objectContaining({ field: "readyForMeeting" }),
      ]),
    })

    const sent = await send(record.id)

    await updateRecord(database, ca, record.id, {
      ...ready({ clientConfirmed: "Yes", preMeetHeld: "Yes" }),
      script: sent.payload.script ?? null,
    })

    await expect(submitRecord(database, ca, record.id)).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: "readyForMeeting" })],
    })
  })

  it("locks once sent with every answer Yes, which nobody approves", async () => {
    const record = await draft()
    const sent = await send(record.id)

    await updateRecord(database, ca, record.id, {
      ...ready({
        clientConfirmed: "Yes",
        preMeetHeld: "Yes",
        readyForMeeting: "Yes",
      }),
      script: sent.payload.script ?? null,
    })

    expect((await submitRecord(database, ca, record.id)).state).toBe("locked")
  })
})

describe("what the client gets", () => {
  let client: string
  let recordId: string

  beforeEach(async () => {
    await reachInvite()
    client = await addPerson("Akosua Client", ["Client"])
    recordId = (await draft()).id
  })

  it("leaves 2.0's values out of the record the client reads", async () => {
    const asClient = await getRecord(database, client, recordId)

    expect(asClient.payload).not.toHaveProperty("clientConcerns")
    expect(asClient.payload).not.toHaveProperty("hardLimits")
    expect(asClient.payload.platform).toBe("Google Meet")

    const asCa = await getRecord(database, ca, recordId)

    expect(asCa.payload.hardLimits).toBe(ready().hardLimits)
  })

  it("leaves 2.0 out of the client's form and PDF, and the system's own fields out of everyone's", async () => {
    const keys = (client: boolean) =>
      toolAsShown(d28, { client }).fields.map((field) => field.key)

    expect(keys(true)).not.toContain("referenceDocument")
    expect(keys(true)).not.toContain("hardLimits")
    expect(keys(true)).toContain("script")
    expect(keys(false)).toContain("hardLimits")
    expect(keys(false)).not.toContain("inviteDigest")

    const titles = async (person: string) =>
      (await recordContent(database, person, recordId)).content.sections.map(
        (section) => section.title
      )

    expect(await titles(client)).not.toContain(
      "2.0 Pre-meeting strategy alignment"
    )
    expect(await titles(client)).toContain(
      "3.0 Standard meeting invite script (copy & paste to client)"
    )
    expect(await titles(ca)).toContain("2.0 Pre-meeting strategy alignment")
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM, LO, CR and client read it, and nobody else see it", async () => {
    const readers = [
      await addPerson("Ama Owusu", ["PM"]),
      await addPerson("Kojo Mensah", ["LO"]),
      await addPerson("Yaw Boateng", ["CR"]),
      await addPerson("Akosua Client", ["Client"]),
    ]

    const others = [
      await addPerson("Kofi Asare", ["OM"]),
      await addPerson("Esi Darko", ["FO"]),
    ]

    expect(await can(database, ca, projectId, "D2.8", "write")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.8", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.8", "write")).toBe(
        false
      )
    }

    for (const other of others) {
      expect(await can(database, other, projectId, "D2.8", "read")).toBe(false)
    }
  })
})
