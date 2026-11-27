import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { can } from "@/server/permissions/permissions"
import { withPeopleOptions } from "@/server/records/people-options"
import {
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
  type ToolRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import {
  kickoffMinutesStart,
  kickoffMinutesValues,
} from "@/server/team/kickoff-notes"
import type { TableField } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"
import { availableTools } from "@/server/workflow/workflow"

import { d41 } from "./d4-1"
import { d42 } from "./d4-2"
import { d43 } from "./d4-3"
import { d44 } from "./d4-4"
import { d45 } from "./d4-5"
import { d46 } from "./d4-6"
import { d47 } from "./d4-7"

const database = createTestDatabase()

for (const tool of [d41, d42, d43, d44, d45, d46, d47]) {
  tools.registerTool(tool)
}

registerTestTools({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

loadUnorderedWorkflow({
  wb01: ["D1.15", "T3.D1.15a", "D1.16"],
  wb02: ["D2.1", "D2.2", "D2.6", "D2.12", "D2.14"],
  wb03: ["D3.10"],
})

let projectId: string

let pm: string

let le: string

let transport: FakeTransport

async function addProject(track = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, $3) RETURNING id",
    ["Rice Mill", requestId, track]
  )

  return rows[0]!.id
}

// A person holding `held` on the project and, but for Client, as company
// roles.
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

    if (role === "Client") {
      continue
    }

    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [rows[0]!.id, role]
    )
  }

  return rows[0]!.id
}

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, cycle, state, payload, submitted_at, locked_at) VALUES ($1, $2, 1, 'locked', $3, $4, $4)",
    [projectId, toolId, payload, "2026-12-31T09:00:00Z"]
  )
}

const roster = {
  roster: [
    { role: "Mid-Level CAD Engineer", engineer: "Kojo Antwi", days: 15 },
    { role: "Junior Technician", engineer: "Efua Mensah", days: 10 },
  ],
}

// Everything before D4.7, with D4.6 locked unless `withInvite` is false.
async function unblocked(withInvite = true) {
  for (const toolId of [
    "D1.15",
    "D1.16",
    "D2.1",
    "D2.2",
    "D2.6",
    "D2.12",
    "D2.14",
  ]) {
    await addRecord(toolId)
  }

  await addRecord("D3.10", { authorized: "Yes" })

  for (const toolId of ["D4.1", "D4.2", "D4.4", "D4.5"]) {
    await addRecord(toolId)
  }

  await addRecord("D4.3", roster)

  if (withInvite) {
    await addRecord("D4.6", { meetingDate: "2027-01-05" })
  }
}

async function openD47() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.7"
  )
}

function ready(values: JsonObject = {}): JsonObject {
  return {
    actualDate: "2027-01-05",
    attendance: [
      { sn: "2.1", present: "Yes" },
      { sn: "2.2", present: "No", notes: "On leave" },
    ],
    teamClear: "Yes",
    ...values,
  }
}

async function draft(values = ready(), before?: ToolRecord) {
  return saveDraft(database, le, {
    projectId,
    toolId: "D4.7",
    cycle: 1,
    values,
    ...(before && { expectedUpdatedAt: before.updatedAt }),
  })
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.message)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)

  transport = createFakeTransport()
  projectId = await addProject()
  pm = await addPerson("Ama Owusu", ["PM"])
  le = await addPerson("Kwame Boateng", ["LE"])
  await addPerson("Kojo Antwi", ["AE"])
  await addPerson("Efua Mensah", ["LD"])
})

afterAll(async () => {
  await database.pool.end()
})

describe("D4.7 kick-off meeting minutes", () => {
  it("opens on Tier 1 once D4.6 locks", async () => {
    await unblocked(false)

    expect(await openD47()).toEqual([])

    await addRecord("D4.6", { meetingDate: "2027-01-05" })

    expect(await openD47()).toHaveLength(1)
    expect(d47.tier).toBe(1)
  })

  it("lets the LE write it, the PM approve it, and the client read it", async () => {
    const client = await addPerson("Akosua Client", ["Client"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, le, projectId, "D4.7", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D4.7", "write")).toBe(false)
    expect(await can(database, pm, projectId, "D4.7", "approve")).toBe(true)
    expect(await can(database, client, projectId, "D4.7", "read")).toBe(true)
    expect(await can(database, fo, projectId, "D4.7", "read")).toBe(false)
  })

  it("starts on D4.6's date, with the PM and D4.3's roster", async () => {
    await unblocked()

    expect(await kickoffMinutesStart(database, projectId)).toEqual({
      actualDate: "2027-01-05",
    })

    expect(await kickoffMinutesValues(database, projectId, {})).toMatchObject({
      leadFacilitator: "Ama Owusu",
      attendance: [
        { sn: "2.1", attendee: "Kojo Antwi", role: "Mid-Level CAD Engineer" },
        { sn: "2.2", attendee: "Efua Mensah", role: "Junior Technician" },
      ],
    })
  })

  it("lists the roster and the PM in each people pick", async () => {
    await unblocked()

    const shown = await withPeopleOptions(database, d47, projectId)

    const team = ["Kojo Antwi", "Efua Mensah", "Ama Owusu"]

    const noteTaker = shown.fields.find((field) => field.key === "noteTaker")

    expect(noteTaker?.type === "select" && noteTaker.options).toEqual(team)

    for (const [table, column] of [
      ["resolutions", "raisedBy"],
      ["dayOneActions", "assignedTo"],
    ]) {
      // SAFETY: both keys name table fields of D4.7.
      const field = shown.fields.find((each) => each.key === table) as
        TableField | undefined

      const select = field?.columns.find((each) => each.key === column)

      expect(select?.type === "select" && select.options).toEqual(team)
    }
  })

  it("keeps the LE's answers by roster row, and the attendees they add as typed", async () => {
    await unblocked()

    const saved = await draft(
      ready({
        attendance: [
          { sn: "2.1", present: "Yes" },
          { sn: "2.2", present: "No", notes: "On leave" },
          { attendee: "Yaw Darko", role: "Client liaison", present: "Yes" },
        ],
      })
    )

    expect(saved.payload.attendance).toEqual([
      { sn: "2.1", present: "Yes" },
      { sn: "2.2", present: "No", notes: "On leave" },
      { attendee: "Yaw Darko", role: "Client liaison", present: "Yes" },
    ])

    const values = await kickoffMinutesValues(
      database,
      projectId,
      saved.payload
    )

    expect(values.attendance).toEqual([
      {
        sn: "2.1",
        attendee: "Kojo Antwi",
        role: "Mid-Level CAD Engineer",
        present: "Yes",
      },
      {
        sn: "2.2",
        attendee: "Efua Mensah",
        role: "Junior Technician",
        present: "No",
        notes: "On leave",
      },
      { attendee: "Yaw Darko", role: "Client liaison", present: "Yes" },
    ])
  })

  it("never stores a roster row's name or role from the form", async () => {
    await unblocked()

    const saved = await draft(
      ready({
        attendance: [
          { sn: "2.1", attendee: "Someone Else", role: "Boss", present: "Yes" },
        ],
      })
    )

    expect(saved.payload.attendance).toEqual([{ sn: "2.1", present: "Yes" }])
  })
})

describe("submitting and signing", () => {
  beforeEach(async () => {
    await unblocked()
  })

  it("refuses to submit with an attendee unanswered or 5.0 No", async () => {
    const unanswered = await draft(
      ready({ attendance: [{ sn: "2.1", present: "Yes" }, { sn: "2.2" }] })
    )

    expect(
      await refusal(submitRecord(database, le, unanswered.id, transport))
    ).toContain("Required")

    const no = await draft(ready({ teamClear: "No" }), unanswered)

    expect(
      await refusal(submitRecord(database, le, no.id, transport))
    ).toContain(
      "Answer Yes once every team member is clear on their Phase 1 objectives"
    )
  })

  it("tells the PM, who signs, which fills in Date and locks it", async () => {
    const submitted = await submitRecord(
      database,
      le,
      (await draft()).id,
      transport
    )

    expect(await listNotifications(database, pm)).not.toEqual([])
    expect(
      transport.sent.some((each) => each.to.includes("ama.owusu@imhogen.test"))
    ).toBe(true)

    const signed = await signField(
      database,
      pm,
      submitted.id,
      "pmSignature",
      transport
    )

    expect(signed.state).toBe("locked")

    const values = await kickoffMinutesValues(
      database,
      projectId,
      signed.payload
    )

    expect(values.signedDate).toBe(new Date().toISOString().slice(0, 10))
  })

  it("lets the PM send it back instead", async () => {
    const submitted = await submitRecord(
      database,
      le,
      (await draft()).id,
      transport
    )

    const back = await sendBackRecord(
      database,
      pm,
      submitted.id,
      "Add the Day 1 tasks",
      transport
    )

    expect(back.state).toBe("draft")
  })
})
