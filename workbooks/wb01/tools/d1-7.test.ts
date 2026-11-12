import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { defaultAgenda } from "@/lib/calendar-agenda"
import { notesStart } from "@/lib/meeting-notes"
import { lockedCalendar } from "@/server/meetings/meeting-notes"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  SendBackReasonError,
  ValidationError,
  approveRecord,
  getRecord,
  sendBackRecord,
  sentBackReason,
  submitRecord,
} from "@/server/records/records"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { d16 } from "./d1-6"
import { d17 } from "./d1-7"

const database = createTestDatabase()

tools.registerTool(d16)

tools.registerTool(d17)

loadUnorderedWorkflow({ wb01: ["D1.6", "D1.7"] })

let projectId: string

let om: string

let pm: string

let client: string

const calendar = {
  meetingDate: "2026-11-17",
  meetingTime: "14:00",
  meetingTimeZone: "Africa/Accra",
  imhogenAttendees: [
    { personId: "a", name: "Kwabena Asante", role: "OM" },
    { personId: "b", name: "Ama Owusu", role: "PM" },
  ],
  clientAttendees: "Kwaku Ampofo, Esi Mensah",
  agenda: [
    { minutes: 5, topic: "Introductions", leadSpeaker: "PM" },
    { minutes: 15, topic: "Technical requirements", leadSpeaker: "LE" },
  ],
}

// Notes ready to submit.
const complete = {
  actualDate: "2026-11-17",
  actualStartTime: "14:00",
  actualEndTime: "14:35",
  imhogenPresent: [{ name: "Kwabena Asante", present: true }],
  clientPresent: [{ name: "Kwaku Ampofo", present: true }],
  discussion: [
    {
      minutes: 5,
      topic: "Introductions",
      rawNotes: "They asked about the agenda.",
      remarks: "Their brief was detailed.",
    },
  ],
  parkingLot: [{ item: "Choose a date to visit the site", action: "OM" }],
  primaryOutcome: "We will set a date to visit the site.",
  clientNextStep: "Confirm the proposed date.",
  imhogenNextStep: "Propose a site visit date.",
}

async function addProject() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, 'Tier_1') RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`]
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

async function submitted(payload: JsonObject = complete) {
  const id = await addRecord("D1.7", "draft", payload)

  await submitRecord(database, om, id)

  return id
}

async function noticesOf(personId: string) {
  const { rows } = await database.pool.query<{ kind: string; text: string }>(
    "SELECT kind, text FROM notifications WHERE person_id = $1 AND kind = 'sent_back'",
    [personId]
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject()
  om = await addPerson("Kwabena Asante", ["OM"])
  pm = await addPerson("Ama Owusu", ["PM"])
  client = await addPerson("Kwaku Ampofo", ["Client"])
  await addRecord("D1.6", "locked", calendar)
})

afterAll(async () => {
  await database.pool.end()
})

describe("where D1.7 starts", () => {
  it("takes the agenda, the invited attendees and the planned time from the locked D1.6", async () => {
    const start = notesStart(await lockedCalendar(database, projectId))

    expect(start).toEqual({
      actualDate: "2026-11-17",
      actualStartTime: "14:00",
      imhogenPresent: [
        { name: "Kwabena Asante", present: false },
        { name: "Ama Owusu", present: false },
      ],
      clientPresent: [
        { name: "Kwaku Ampofo", present: false },
        { name: "Esi Mensah", present: false },
      ],
      discussion: [
        { minutes: 5, topic: "Introductions", rawNotes: "", remarks: "" },
        {
          minutes: 15,
          topic: "Technical requirements",
          rawNotes: "",
          remarks: "",
        },
      ],
    })
  })

  it("uses the sheet's agenda when D1.6 kept it unchanged", () => {
    const start = notesStart({})

    expect(start.discussion).toHaveLength(defaultAgenda.length)
    expect(start).not.toHaveProperty("actualDate")
  })
})

describe("submitting and approving D1.7", () => {
  it("refuses to submit a topic with no notes", async () => {
    const id = await addRecord("D1.7", "draft", {
      ...complete,
      discussion: [{ minutes: 5, topic: "Introductions", rawNotes: "" }],
    })

    await expect(submitRecord(database, om, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("refuses to submit without the close-out", async () => {
    const id = await addRecord("D1.7", "draft", {
      ...complete,
      primaryOutcome: "",
    })

    await expect(submitRecord(database, om, id)).rejects.toThrow(
      ValidationError
    )
  })

  it("the PM's approval locks it", async () => {
    const id = await submitted()

    const locked = await approveRecord(database, pm, id)

    expect(locked.state).toBe("locked")
  })

  it("the OM cannot approve it", async () => {
    const id = await submitted()

    await expect(approveRecord(database, om, id)).rejects.toThrow(
      PermissionDeniedError
    )
  })
})

describe("sending D1.7 back", () => {
  it("returns it to the OM as a draft with the reason, and tells the OM", async () => {
    const id = await submitted()

    const back = await sendBackRecord(
      database,
      pm,
      id,
      "Add the client's budget remark."
    )

    expect(back.state).toBe("draft")
    expect(back.payload).toMatchObject(complete)
    expect(await sentBackReason(database, back)).toBe(
      "Add the client's budget remark."
    )
    expect(await noticesOf(om)).toEqual([
      {
        kind: "sent_back",
        text: "Raw Meeting Notes on Tema Foods Boiler Skid: Add the client's budget remark.",
      },
    ])
  })

  it("forgets the reason once it is submitted again", async () => {
    const id = await submitted()

    await sendBackRecord(database, pm, id, "Add the budget remark.")

    const again = await submitRecord(database, om, id)

    expect(await sentBackReason(database, again)).toBeNull()
  })

  it("needs a reason", async () => {
    const id = await submitted()

    await expect(sendBackRecord(database, pm, id, "  ")).rejects.toThrow(
      SendBackReasonError
    )
  })

  it("only the approver may send it back", async () => {
    const id = await submitted()

    await expect(
      sendBackRecord(database, om, id, "Not mine to send back")
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("only a submitted record goes back", async () => {
    const id = await addRecord("D1.7", "draft", complete)

    await expect(
      sendBackRecord(database, pm, id, "Not submitted yet")
    ).rejects.toThrow(InvalidTransitionError)
  })
})

describe("what the client reads", () => {
  it("nothing before the PM approves", async () => {
    const id = await submitted()

    expect((await getRecord(database, client, id)).payload).toEqual({})
    expect((await getRecord(database, pm, id)).payload).toMatchObject(complete)
  })

  it("the notes once locked", async () => {
    const id = await submitted()

    await approveRecord(database, pm, id)

    expect((await getRecord(database, client, id)).payload).toMatchObject(
      complete
    )
  })
})
