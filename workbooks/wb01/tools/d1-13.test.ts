import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import {
  MeetingNotReadyError,
  chooseMeetingTime,
  confirmMeeting,
  sendMeetingTimes,
} from "@/server/meetings/meeting-proposal"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  RecordNotFoundError,
  ValidationError,
  approveRecord,
  getRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import {
  clientMeeting,
  scopeValues,
  sendAlignmentInvite,
} from "@/server/scope/scope-of-work"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d113 } from "./d1-13"

const database = createTestDatabase()

tools.registerTool(d113)

loadUnorderedWorkflow({ wb01: ["D1.13"] })

const NOW = new Date("2026-11-12T09:00:00Z")

const slot = { date: "2026-11-20", time: "10:00", timeZone: "Africa/Accra" }

const scope = {
  vision: "Document the trailer.",
  includedScope: [{ category: "CAD", description: "A 3D model." }],
  phases: [{ name: "Review", activities: "Review.", duration: "1 week" }],
}

let projectId: string

let le: string

let pm: string

let client: string

let transport: FakeTransport

async function addPerson(name: string, held: Role[], domain = "imhogen.test") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase().replace(" ", ".")}@${domain}`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

async function addScope(payload: JsonObject = scope) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.13', 'draft', $2) RETURNING id",
    [projectId, payload]
  )

  return rows[0]!.id
}

// Times sent and the client's choice made, with the platform and link in.
async function booked() {
  const id = await addScope({
    ...scope,
    slots: [slot],
    platform: "Google Meet",
    meetingLink: "https://meet.google.com/abc-defg-hij",
  })

  await sendMeetingTimes(database, le, id, {
    transport,
    baseURL: "http://localhost:3000",
    now: NOW,
  })
  await chooseMeetingTime(database, client, id, { slot: 1 }, NOW)

  return id
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', 'T1-42', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', 'Tier_1', $1, $2)",
    [
      projectId,
      {
        contact_person: "Kwaku Ampofo",
        email: "kwaku.ampofo@temafoods.test",
        project_title: "Packaged boiler skid",
      },
    ]
  )

  le = await addPerson("Kojo Antwi", ["LE"])
  pm = await addPerson("Ama Owusu", ["PM"])
  client = await addPerson("Kwaku Ampofo", ["Client"], "temafoods.test")
  transport = createFakeTransport()
})

afterAll(async () => {
  await database.pool.end()
})

describe("booking the alignment meeting", () => {
  it("the LE sends the times, and the client is emailed about the alignment meeting", async () => {
    const id = await addScope({ ...scope, slots: [slot] })

    await sendMeetingTimes(database, le, id, {
      transport,
      baseURL: "http://localhost:3000",
      now: NOW,
    })

    expect(transport.sent[0]!.subject).toContain(
      "feasibility & engineering alignment meeting"
    )
    expect(transport.sent[0]!.text).toContain("draft scope of work")
  })

  it("the client sees the times, and nothing of the scope", async () => {
    const id = await booked()

    expect(await clientMeeting(database, client, projectId)).toMatchObject({
      recordId: id,
      open: true,
      saved: { chosenSlot: 1, agreedDate: slot.date },
    })
    expect((await getRecord(database, client, id)).payload).toEqual({})
    expect(await clientMeeting(database, le, projectId)).toBeNull()
  })

  it("sends the calendar invite to the client, copied to the LE and PM", async () => {
    const id = await booked()

    const updated = await sendAlignmentInvite(database, le, id, {
      transport,
      now: NOW,
    })

    const invite = transport.sent.at(-1)!

    expect(invite.to).toBe("kwaku.ampofo@temafoods.test")
    expect(invite.cc).toEqual(
      expect.arrayContaining([
        "kojo.antwi@imhogen.test",
        "ama.owusu@imhogen.test",
      ])
    )
    expect(invite.attachments?.[0]?.filename).toBe("invite.ics")
    expect(updated.payload.inviteSentAt).toBe(NOW.toISOString())
  })

  it("refuses the invite until the client has chosen", async () => {
    const id = await addScope({
      ...scope,
      slots: [slot],
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/abc-defg-hij",
    })

    await expect(
      sendAlignmentInvite(database, le, id, { transport, now: NOW })
    ).rejects.toThrow(MeetingNotReadyError)
  })

  it("only the LE books it", async () => {
    const id = await addScope({ ...scope, slots: [slot] })

    await expect(
      sendMeetingTimes(database, pm, id, { transport, now: NOW })
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("is never confirmed the D1.5 way, which would lock the scope", async () => {
    const id = await booked()

    await expect(confirmMeeting(database, le, id)).rejects.toThrow(
      RecordNotFoundError
    )
  })
})

describe("submitting and approving the scope", () => {
  it("cannot be submitted before the invite is sent", async () => {
    const id = await booked()

    await expect(submitRecord(database, le, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("the LE signs and submits once the invite is out, and the PM's approval locks the scope", async () => {
    const id = await booked()

    await sendAlignmentInvite(database, le, id, { transport, now: NOW })
    await signField(database, le, id, "signature")
    await submitRecord(database, le, id)

    const locked = await approveRecord(database, pm, id)

    expect(locked.state).toBe("locked")
    expect(
      await scopeValues(database, projectId, {
        state: "locked",
        payload: locked.payload,
      })
    ).toMatchObject({
      scopeLocked: "Yes",
      readyForCosting: "Yes",
      sowStatus: "Approved, scope locked",
    })
  })
})
