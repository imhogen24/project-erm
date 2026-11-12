import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  calendarFile,
  defaultAgenda,
  missingToBeReady,
  preMeetingChecks,
  agendaOf,
} from "@/lib/calendar-agenda"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import {
  AgendaNotReadyError,
  clientAttendees,
  readyForMeeting,
  sendCalendarInvite,
} from "@/server/meetings/calendar-invite"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d15 } from "./d1-5"
import { d16 } from "./d1-6"

const database = createTestDatabase()

tools.registerTool(d15)

tools.registerTool(d16)

loadUnorderedWorkflow({ wb01: ["D1.5", "D1.6"] })

const NOW = new Date("2026-11-12T09:00:00Z")

const confirmed = {
  agreedDate: "2026-11-17",
  agreedTime: "14:00",
  agreedTimeZone: "Africa/Accra",
  platform: "Google Meet",
  meetingLink: "https://meet.google.com/zpr-zhib-amp",
  chosenSlot: 2,
  clientConfirmed: true,
}

let projectId: string

let transport: FakeTransport

let om: string

let pm: string

let le: string

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, 'Tier_1') RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
    [
      rows[0]!.id,
      {
        contact_person: "Kwaku Ampofo",
        email: "kwaku.ampofo@temafoods.test",
        project_title: "Packaged boiler skid",
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

async function addRecord(toolId: string, state: string, payload: JsonObject) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, $2, $3, $4) RETURNING id",
    [projectId, toolId, state, payload]
  )

  return rows[0]!.id
}

async function record(recordId: string) {
  const { rows } = await database.pool.query<{
    state: string
    payload: JsonObject
  }>("SELECT state, payload FROM tool_records WHERE id = $1", [recordId])

  return rows[0]!
}

function attendees(...ids: string[]) {
  return ids.map((personId) => ({ personId }))
}

function send(recordId: string, actor = om) {
  return sendCalendarInvite(database, actor, recordId, { transport, now: NOW })
}

const allDone = preMeetingChecks.map((each) => ({
  task: each.task,
  assignee: each.assignee,
  status: "Done",
}))

beforeEach(async () => {
  await resetTestData(database)

  transport = createFakeTransport()
  projectId = await addProject()
  om = await addPerson("Kwabena Asante", ["OM"])
  pm = await addPerson("Ama Owusu", ["PM"])
  le = await addPerson("Kojo Antwi", ["LE"])
  await addRecord("D1.5", "locked", confirmed)
})

afterAll(async () => {
  await database.pool.end()
})

describe("the calendar file", () => {
  const file = calendarFile({
    uid: "abc@erm.imhogen",
    sequence: 1,
    start: new Date("2026-11-17T14:00:00Z"),
    minutes: 40,
    summary: "IMHOGEN discovery meeting: Boiler, skid; v2",
    description: "First line\nSecond line",
    location: "https://meet.google.com/zpr-zhib-amp",
    link: "https://meet.google.com/zpr-zhib-amp",
    organizer: "noreply@imhogen.com",
    attendees: [{ name: "Kwaku Ampofo", email: "kwaku.ampofo@temafoods.test" }],
    now: new Date("2026-11-12T09:00:00Z"),
  })

  it("is a meeting request with the start, the end and the attendees", () => {
    expect(file).toContain("METHOD:REQUEST")
    expect(file).toContain("UID:abc@erm.imhogen")
    expect(file).toContain("SEQUENCE:1")
    expect(file).toContain("DTSTART:20261117T140000Z")
    expect(file).toContain("DTEND:20261117T144000Z")
    expect(file).toContain("mailto:kwaku.ampofo@temafoods.test")
  })

  it("quotes a name with a comma, and folds by bytes without splitting a character", () => {
    const named = calendarFile({
      uid: "abc@erm.imhogen",
      sequence: 0,
      start: new Date("2026-11-17T14:00:00Z"),
      minutes: 30,
      summary: "Meeting",
      description: `${"a".repeat(62)}🙂🙂🙂`,
      location: "Accra",
      organizer: "noreply@imhogen.com",
      attendees: [{ name: "Doe, Jane", email: "jane@example.com" }],
      now: new Date("2026-11-12T09:00:00Z"),
    })

    expect(named).toContain('CN="Doe, Jane"')

    for (const line of named.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }

    expect(named.replace(/\r\n /g, "")).toContain("🙂🙂🙂")
  })

  it("escapes commas, semicolons and line breaks, and folds long lines", () => {
    expect(file).toContain(
      "SUMMARY:IMHOGEN discovery meeting: Boiler\\, skid\\; v2"
    )
    expect(file).toContain("DESCRIPTION:First line\\nSecond line")

    for (const line of file.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })
})

describe("clientAttendees", () => {
  it("names the web request's contact first, and each client account once", async () => {
    await addPerson("Kwaku Ampofo", ["Client"])

    expect(await clientAttendees(database, projectId)).toEqual([
      { name: "Kwaku Ampofo", email: "kwaku.ampofo@temafoods.test" },
      { name: "Kwaku Ampofo", email: "kwaku.ampofo@imhogen.test" },
    ])
  })
})

describe("sendCalendarInvite", () => {
  it("emails the client, copying the IMHOGEN attendees, with the calendar file", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om, le),
    })

    await send(recordId)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe("kwaku.ampofo@temafoods.test")
    expect(email.cc).toEqual([
      "kwabena.asante@imhogen.test",
      "kojo.antwi@imhogen.test",
    ])
    expect(email.text).toContain("Tue, 17 Nov 2026, 14:00 GMT")
    expect(email.text).toContain(`- 15 min: ${defaultAgenda[1]!.topic}`)
    expect(email.attachments?.[0]).toMatchObject({
      filename: "invite.ics",
      contentType: expect.stringContaining("text/calendar"),
    })
    expect(email.attachments?.[0]?.content).toContain("SEQUENCE:0")

    expect(agendaOf((await record(recordId)).payload)).toMatchObject({
      inviteSentAt: NOW.toISOString(),
      inviteSequence: 0,
      clientAttendees: "Kwaku Ampofo",
    })
  })

  it("sends the same invite once, and a changed agenda as an update", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
    })

    await send(recordId)
    await send(recordId)

    expect(transport.sent).toHaveLength(1)

    await database.pool.query(
      "UPDATE tool_records SET payload = payload || $2 WHERE id = $1",
      [
        recordId,
        {
          agenda: [{ minutes: 30, topic: "Boiler sizing", leadSpeaker: "LE" }],
        },
      ]
    )

    await send(recordId)

    expect(transport.sent).toHaveLength(2)
    expect(transport.sent[1]!.attachments?.[0]?.content).toContain("SEQUENCE:1")
  })

  it("is marked sent only once the email goes, and a retry sends the same version", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
    })

    const failing = {
      name: "failing",
      send: async () => {
        throw new Error("Resend is down")
      },
    }

    await expect(
      sendCalendarInvite(database, om, recordId, {
        transport: failing,
        now: NOW,
      })
    ).rejects.toThrow("The invite did not go")

    expect(agendaOf((await record(recordId)).payload).inviteSentAt).toBe(
      undefined
    )

    await send(recordId)

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]!.attachments?.[0]?.content).toContain("SEQUENCE:0")
    expect(agendaOf((await record(recordId)).payload).inviteSentAt).toBe(
      NOW.toISOString()
    )
  })

  it("refuses with nobody from IMHOGEN chosen, saying so", async () => {
    const recordId = await addRecord("D1.6", "draft", {})

    await expect(send(recordId)).rejects.toMatchObject({
      missing: ["choose who attends from IMHOGEN"],
    })
    expect(transport.sent).toHaveLength(0)
  })

  it("refuses someone who is not on the project", async () => {
    const outsider = await database.pool.query<{ id: string }>(
      "INSERT INTO people (name, email) VALUES ('Yaw', 'yaw@imhogen.test') RETURNING id"
    )

    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(outsider.rows[0]!.id),
    })

    await expect(send(recordId)).rejects.toBeInstanceOf(AgendaNotReadyError)
  })

  it("refuses a meeting time that has passed", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
    })

    await expect(
      sendCalendarInvite(database, om, recordId, {
        transport,
        now: new Date("2026-11-18T00:00:00Z"),
      })
    ).rejects.toMatchObject({
      missing: ["the meeting time has passed; agree a new one on D1.5"],
    })
  })

  it("refuses the PM, who only reads D1.6", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
    })

    await expect(send(recordId, pm)).rejects.toBeInstanceOf(
      PermissionDeniedError
    )
  })
})

describe("readyForMeeting", () => {
  it("refuses until the invite is sent and every check is done", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
    })

    await expect(readyForMeeting(database, om, recordId)).rejects.toMatchObject(
      {
        missing: [
          "send the calendar invite",
          "check 1 is not done",
          "check 2 is not done",
          "check 3 is not done",
        ],
      }
    )
  })

  it("locks D1.6 and keeps the meeting details from D1.5", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      imhogenAttendees: attendees(om),
      preMeetingChecks: allDone,
    })

    await send(recordId)
    await readyForMeeting(database, om, recordId)

    const locked = await record(recordId)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      meetingDate: "2026-11-17",
      meetingTime: "14:00",
      platform: "Google Meet",
    })
  })

  it("names the checks still open", () => {
    expect(
      missingToBeReady(
        agendaOf({
          inviteSentAt: NOW.toISOString(),
          preMeetingChecks: [{ ...allDone[0]!, status: "Not done" }],
        })
      )
    ).toEqual([
      "check 1 is not done",
      "check 2 is not done",
      "check 3 is not done",
    ])
  })

  it("refuses the PM, who only reads D1.6", async () => {
    const recordId = await addRecord("D1.6", "draft", {
      preMeetingChecks: allDone,
    })

    await expect(
      readyForMeeting(database, pm, recordId)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
