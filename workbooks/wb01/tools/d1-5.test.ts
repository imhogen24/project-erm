import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ValidationError,
  saveDraft,
} from "@/server/records/records"
import { meetingInstant } from "@/lib/meeting-time"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { d15 } from "./d1-5"

import {
  MeetingNotReadyError,
  chooseMeetingTime,
  confirmMeeting,
  missingToSendTimes,
  proposalOf,
  proposeMeetingTime,
  schedulingEmail,
  sendMeetingTimes,
  slotStatus,
} from "@/server/meetings/meeting-proposal"

const database = createTestDatabase()

tools.registerTool(d15)

loadUnorderedWorkflow({ wb01: ["D1.5"] })

const NOW = new Date("2026-11-12T09:00:00Z")

const WEB_REQUEST = {
  contact_person: "Kwaku Ampofo",
  email: "kwaku.ampofo@temafoods.test",
  project_title: "Packaged boiler skid",
}

const slots = [
  { date: "2026-11-17", time: "11:00", timeZone: "Africa/Accra" },
  { date: "2026-11-17", time: "14:00", timeZone: "Africa/Accra" },
  { date: "2026-11-18", time: "10:00", timeZone: "Africa/Lagos" },
]

let projectId: string

let transport: FakeTransport

let om: string

let pm: string

let client: string

async function addProject(submission: JsonObject | null = WEB_REQUEST) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, 'Tier_1') RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`]
  )

  if (submission) {
    await database.pool.query(
      "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
      [rows[0]!.id, submission]
    )
  }

  return rows[0]!.id
}

async function addPerson(held: Role[], on = projectId) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Person', $1) RETURNING id",
    [`person-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, on, role]
    )
  }

  return rows[0]!.id
}

async function addDraft(payload: JsonObject = { slots }) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.5', 'draft', $2) RETURNING id",
    [projectId, payload]
  )

  return rows[0]!.id
}

async function record(recordId: string) {
  const { rows } = await database.pool.query<{
    state: string
    payload: JsonObject
    updated_at: Date
  }>("SELECT state, payload, updated_at FROM tool_records WHERE id = $1", [
    recordId,
  ])

  return rows[0]!
}

async function notified(personId: string) {
  const { rows } = await database.pool.query<{ kind: string; title: string }>(
    "SELECT kind, title FROM notifications WHERE person_id = $1",
    [personId]
  )

  return rows
}

function send(recordId: string, actor = om) {
  return sendMeetingTimes(database, actor, recordId, {
    transport,
    baseURL: "https://erm.example.com",
    now: NOW,
  })
}

async function sent(payload?: JsonObject) {
  const recordId = await addDraft(payload)

  await send(recordId)

  return recordId
}

beforeEach(async () => {
  await resetTestData(database)

  transport = createFakeTransport()
  projectId = await addProject()
  om = await addPerson(["OM"])
  pm = await addPerson(["PM"])
  client = await addPerson(["Client"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("the scheduling email", () => {
  it("lists each time as the sheet does, and asks the client to choose on their dashboard", () => {
    const text = schedulingEmail(
      {
        contact: "Kwaku Ampofo",
        title: "Packaged boiler skid",
        requestId: "T1-100",
      },
      slots
    )

    expect(text).toContain("Dear Kwaku Ampofo,")
    expect(text).toContain("Packaged boiler skid [T1-100]")
    expect(text).toContain("- Option 1: 17/11/2026 at 11:00 GMT")
    expect(text).toContain("- Option 3: 18/11/2026 at 10:00 WAT (Lagos)")
    expect(text).toContain("on your IMHOGEN dashboard")
  })
})

describe("missingToSendTimes", () => {
  it("asks for at least one time", () => {
    expect(missingToSendTimes(proposalOf({ slots: [] }), NOW)).toEqual([
      "add at least one time",
    ])
  })

  it("names a slot that is incomplete or already passed", () => {
    const missing = missingToSendTimes(
      proposalOf({
        slots: [
          { date: "2026-11-17", time: "", timeZone: "Africa/Accra" },
          { date: "2026-11-01", time: "09:00", timeZone: "Africa/Accra" },
        ],
      }),
      NOW
    )

    expect(missing).toEqual([
      "give slot 1 a date, a time and a time zone",
      "slot 2 has already passed",
    ])
  })
})

describe("sendMeetingTimes", () => {
  it("emails the times to the web request's address, keeps a copy, and tells the client", async () => {
    const recordId = await sent()

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: "kwaku.ampofo@temafoods.test",
      subject: expect.stringContaining("Choose a time"),
    })
    expect(transport.sent[0]!.text).toContain(
      `https://erm.example.com/projects/${projectId}/tools/D1.5`
    )

    const saved = proposalOf((await record(recordId)).payload)

    expect(saved.offeredSlots).toEqual(slots)
    expect(saved.sentToClientAt).toBe(NOW.toISOString())
    expect(saved.emailText).toContain("- Option 2: 17/11/2026 at 14:00 GMT")
    expect(await notified(client)).toEqual([
      {
        kind: "client_slots_ready",
        title: "Choose a time for your discovery meeting",
      },
    ])
  })

  it("sends the same times once, however often it is pressed", async () => {
    const recordId = await sent()

    await send(recordId)

    expect(transport.sent).toHaveLength(1)
  })

  it("emails each new offer, even times that were offered before", async () => {
    const recordId = await sent()

    for (const offer of [[slots[0]!], slots]) {
      await saveDraft(database, om, {
        projectId,
        toolId: "D1.5",
        cycle: 1,
        values: { slots: offer },
        expectedUpdatedAt: (await record(recordId)).updated_at,
      })
      await sendMeetingTimes(database, om, recordId, {
        transport,
        baseURL: "https://erm.example.com",
        now: new Date(NOW.getTime() + transport.sent.length * 60_000),
      })
    }

    expect(transport.sent).toHaveLength(3)
  })

  it("refuses until there is a time, saying so", async () => {
    const recordId = await addDraft({ slots: [] })

    await expect(send(recordId)).rejects.toMatchObject({
      missing: ["add at least one time"],
    })
    expect(transport.sent).toHaveLength(0)
  })

  it("refuses a project whose web request has no email", async () => {
    projectId = await addProject(null)
    om = await addPerson(["OM"])

    const recordId = await addDraft()

    await expect(send(recordId)).rejects.toBeInstanceOf(MeetingNotReadyError)
  })

  it("refuses the PM, who only reads D1.5", async () => {
    const recordId = await addDraft()

    await expect(send(recordId, pm)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })

  it("keeps the times sent when the OM edits the slots afterwards", async () => {
    const recordId = await sent()
    const before = await record(recordId)

    await saveDraft(database, om, {
      projectId,
      toolId: "D1.5",
      cycle: 1,
      values: { slots: [slots[0]!] },
      expectedUpdatedAt: before.updated_at,
    })

    const saved = proposalOf((await record(recordId)).payload)

    expect(saved.slots).toHaveLength(1)
    expect(saved.offeredSlots).toEqual(slots)
    expect(saved.sentToClientAt).toBe(NOW.toISOString())
  })
})

describe("chooseMeetingTime", () => {
  it("records the client's choice, accepts it, declines the rest, and tells the OM and PM", async () => {
    const recordId = await sent()

    await chooseMeetingTime(
      database,
      client,
      recordId,
      {
        slot: 2,
        comment: "The plant manager will join",
      },
      NOW
    )

    const saved = proposalOf((await record(recordId)).payload)

    expect(saved).toMatchObject({
      chosenSlot: 2,
      clientComment: "The plant manager will join",
      agreedDate: "2026-11-17",
      agreedTime: "14:00",
      agreedTimeZone: "Africa/Accra",
      clientConfirmed: true,
    })
    expect([1, 2, 3].map((slot) => slotStatus(saved, slot))).toEqual([
      "Declined",
      "Accepted",
      "Declined",
    ])
    expect(await notified(om)).toEqual([
      { kind: "client_responded", title: "The client chose a meeting time" },
    ])
    expect(await notified(pm)).toHaveLength(1)
  })

  it("keeps the latest choice", async () => {
    const recordId = await sent()

    await chooseMeetingTime(database, client, recordId, { slot: 1 }, NOW)
    await chooseMeetingTime(database, client, recordId, { slot: 3 }, NOW)

    expect(proposalOf((await record(recordId)).payload)).toMatchObject({
      chosenSlot: 3,
      agreedTimeZone: "Africa/Lagos",
    })
  })

  it("is not undone when the OM's edits save", async () => {
    const recordId = await sent()

    await chooseMeetingTime(database, client, recordId, { slot: 2 }, NOW)

    await saveDraft(database, om, {
      projectId,
      toolId: "D1.5",
      cycle: 1,
      values: { slots, platform: "Google Meet" },
      expectedUpdatedAt: (await record(recordId)).updated_at,
    })

    expect(proposalOf((await record(recordId)).payload)).toMatchObject({
      chosenSlot: 2,
      clientConfirmed: true,
      platform: "Google Meet",
    })
  })

  it("refuses before any times were sent", async () => {
    const recordId = await addDraft()

    await expect(
      chooseMeetingTime(database, client, recordId, { slot: 1 }, NOW)
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it("refuses anyone but the client", async () => {
    const recordId = await sent()

    await expect(
      chooseMeetingTime(database, om, recordId, { slot: 1 }, NOW)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("refuses a time that has passed", async () => {
    const recordId = await sent()

    await expect(
      chooseMeetingTime(
        database,
        client,
        recordId,
        { slot: 1 },
        new Date("2026-11-20T00:00:00Z")
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("is kept when the OM presses Send to client again with the same times", async () => {
    const recordId = await sent()

    await chooseMeetingTime(database, client, recordId, { slot: 2 }, NOW)
    await send(recordId)

    expect(proposalOf((await record(recordId)).payload).chosenSlot).toBe(2)
    expect(transport.sent).toHaveLength(1)
  })

  it("refuses a slot that was not offered", async () => {
    const recordId = await sent()

    await expect(
      chooseMeetingTime(database, client, recordId, { slot: 4 }, NOW)
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe("proposeMeetingTime", () => {
  it("records the client's own time, declines every slot, and tells the OM and PM", async () => {
    const recordId = await sent()

    await chooseMeetingTime(database, client, recordId, { slot: 1 }, NOW)
    await proposeMeetingTime(
      database,
      client,
      recordId,
      {
        date: "2026-11-19",
        time: "15:30",
        timeZone: "Europe/London",
        comment: "We are on site the first two days",
      },
      NOW
    )

    const saved = proposalOf((await record(recordId)).payload)

    expect(saved).toMatchObject({
      proposedDate: "2026-11-19",
      proposedTime: "15:30",
      proposedTimeZone: "Europe/London",
      clientComment: "We are on site the first two days",
    })
    expect(saved.chosenSlot).toBeUndefined()
    expect(saved.clientConfirmed).toBeUndefined()
    expect(slotStatus(saved, 1)).toBe("Declined")
    expect((await notified(om)).map((note) => note.title)).toContain(
      "The client proposed another meeting time"
    )
  })

  it("refuses a time that has passed", async () => {
    const recordId = await sent()

    await expect(
      proposeMeetingTime(
        database,
        client,
        recordId,
        { date: "2026-11-01", time: "10:00", timeZone: "Africa/Accra" },
        NOW
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("is cleared when the OM sends times again", async () => {
    const recordId = await sent()

    await proposeMeetingTime(
      database,
      client,
      recordId,
      { date: "2026-11-19", time: "15:30", timeZone: "Africa/Accra" },
      NOW
    )

    await saveDraft(database, om, {
      projectId,
      toolId: "D1.5",
      cycle: 1,
      values: {
        slots: [
          { date: "2026-11-19", time: "15:30", timeZone: "Africa/Accra" },
        ],
      },
      expectedUpdatedAt: (await record(recordId)).updated_at,
    })

    await sendMeetingTimes(database, om, recordId, {
      transport,
      baseURL: "https://erm.example.com",
      now: new Date(NOW.getTime() + 60_000),
    })

    const saved = proposalOf((await record(recordId)).payload)

    expect(saved.proposedDate).toBeUndefined()
    expect(saved.offeredSlots).toHaveLength(1)
    expect(slotStatus(saved, 1)).toBe("Pending")
    expect(transport.sent).toHaveLength(2)
  })
})

describe("confirmMeeting", () => {
  async function chosen(details: JsonObject) {
    const recordId = await sent({ slots, ...details })

    await chooseMeetingTime(database, client, recordId, { slot: 2 }, NOW)

    return recordId
  }

  it("locks D1.5 once the client chose and the platform and link are in", async () => {
    const recordId = await chosen({
      platform: "Google Meet",
      meetingLink: "https://meet.google.com/zpr-zhib-amp",
      calendarInviteSent: true,
    })

    await confirmMeeting(database, om, recordId)

    expect((await record(recordId)).state).toBe("locked")
  })

  it("needs no link for a meeting in person", async () => {
    const recordId = await chosen({ platform: "In person" })

    await confirmMeeting(database, om, recordId)

    expect((await record(recordId)).state).toBe("locked")
  })

  it("refuses until the client has chosen", async () => {
    const recordId = await sent({ slots, platform: "In person" })

    await expect(confirmMeeting(database, om, recordId)).rejects.toMatchObject({
      missing: ["the client has not chosen a time"],
    })
  })

  it("asks for an https link for an online meeting", async () => {
    const recordId = await chosen({
      platform: "Zoom",
      meetingLink: "zoom.us/j/123",
    })

    await expect(confirmMeeting(database, om, recordId)).rejects.toMatchObject({
      missing: ["add the meeting link (https://...)"],
    })
  })

  it("refuses the PM, who only reads D1.5", async () => {
    const recordId = await chosen({ platform: "In person" })

    await expect(confirmMeeting(database, pm, recordId)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })

  it("lets nobody choose again once it is locked", async () => {
    const recordId = await chosen({ platform: "In person" })

    await confirmMeeting(database, om, recordId)

    await expect(
      chooseMeetingTime(database, client, recordId, { slot: 1 }, NOW)
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})

describe("meeting times", () => {
  it("reads a time in its zone", () => {
    expect(
      meetingInstant("2026-11-17", "14:00", "Africa/Lagos")?.toISOString()
    ).toBe("2026-11-17T13:00:00.000Z")
    expect(
      meetingInstant("2026-07-01", "09:30", "Europe/London")?.toISOString()
    ).toBe("2026-07-01T08:30:00.000Z")
  })

  it("refuses a day, a time or an hour that does not exist", () => {
    expect(
      meetingInstant("2027-02-31", "14:00", "Africa/Accra")
    ).toBeUndefined()
    expect(
      meetingInstant("2026-11-17", "25:00", "Africa/Accra")
    ).toBeUndefined()
    expect(
      meetingInstant("2027-03-28", "01:30", "Europe/London")
    ).toBeUndefined()
    expect(meetingInstant("2026-11-17", "14:00", "Mars/Base")).toBeUndefined()
  })
})
