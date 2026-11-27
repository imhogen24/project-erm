import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { kickoffScriptFor } from "@/lib/kickoff-invite"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  getRecord,
  saveDraft,
  submitRecord,
  type ToolRecord,
} from "@/server/records/records"
import { ValidationError } from "@/server/records/validate"
import {
  InviteRefusedError,
  KickoffInviteNotReadyError,
  kickoffInviteStart,
  kickoffInviteValues,
  sendKickoffInvite,
} from "@/server/team/kickoff-invite"
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
import { d48 } from "./d4-8"
import { t3d48a } from "./t3-d4-8a"

const database = createTestDatabase()

for (const tool of [d41, d42, d43, d44, d45, d46, d47, d48, t3d48a]) {
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

const NOW = new Date("2026-11-25T09:00:00Z")

let projectId: string

let pm: string

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

// Everything before D4.6, with D4.5 locked unless `withDeck` is false.
async function unblocked(withDeck = true) {
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

  for (const toolId of ["D4.1", "D4.2", "D4.4"]) {
    await addRecord(toolId)
  }

  await addRecord("D4.3", roster)

  if (withDeck) {
    await addRecord("D4.5")
  }
}

async function openD46() {
  return (await availableTools(database, projectId)).filter(
    (each) => each.toolId === "D4.6"
  )
}

function ready(values: JsonObject = {}): JsonObject {
  return {
    meetingDate: "2026-12-01",
    meetingTime: "10:00",
    location: "HQ Boardroom",
    script: kickoffScriptFor("Rice Mill"),
    ...values,
  }
}

async function draft(values = ready(), before?: ToolRecord) {
  return saveDraft(database, pm, {
    projectId,
    toolId: "D4.6",
    cycle: 1,
    values,
    ...(before && { expectedUpdatedAt: before.updatedAt }),
  })
}

async function send(id: string, via: Transport = transport) {
  return sendKickoffInvite(database, pm, id, { transport: via, now: NOW })
}

function icsOf(index: number) {
  return String(transport.sent[index]!.attachments![0]!.content)
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
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")

  transport = createFakeTransport()
  projectId = await addProject()
  pm = await addPerson("Ama Owusu", ["PM"])
  await addPerson("Kojo Antwi", ["AE"])
  await addPerson("Efua Mensah", ["LD"])
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("D4.6 kick-off calendar invite and agenda", () => {
  it("opens on Tier 1 once D4.5 locks", async () => {
    await unblocked(false)

    expect(await openD46()).toEqual([])

    await addRecord("D4.5")

    expect(await openD46()).toHaveLength(1)
    expect(d46.tier).toBe(1)
  })

  it("lets only the PM write it; the client and the engineers read it", async () => {
    const client = await addPerson("Akosua Client", ["Client"])
    const le = await addPerson("Kwame Boateng", ["LE"])
    const fo = await addPerson("Gifty Ofori", ["FO"])

    expect(await can(database, pm, projectId, "D4.6", "write")).toBe(true)
    expect(await can(database, client, projectId, "D4.6", "read")).toBe(true)
    expect(await can(database, le, projectId, "D4.6", "read")).toBe(true)
    expect(await can(database, le, projectId, "D4.6", "write")).toBe(false)
    expect(await can(database, fo, projectId, "D4.6", "read")).toBe(false)
  })

  it("starts on the sheet's script, with the PM and the roster in 1.0", async () => {
    await unblocked()

    const start = await kickoffInviteStart(database, projectId)

    expect(start.script).toMatch(/^Team\n\nWe are officially kicking off/)
    expect(start.script).toContain("execution for Rice Mill.")

    expect(await kickoffInviteValues(database, projectId, {})).toMatchObject({
      leadFacilitator: "Ama Owusu",
      attendees: "Kojo Antwi, Efua Mensah",
      inviteSent: "No",
    })
  })
})

describe("sending the invite", () => {
  beforeEach(async () => {
    await unblocked()
  })

  it("emails the rostered engineers and the PM once, with a calendar file", async () => {
    const record = await draft()

    const sent = await send(record.id)

    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe("kojo.antwi@imhogen.test")
    expect(email.cc).toEqual([
      "efua.mensah@imhogen.test",
      "ama.owusu@imhogen.test",
    ])
    expect(email.subject).toBe("Internal Kick-off: Rice Mill")
    expect(email.text).toContain("execution for Rice Mill.")
    expect(email.text).toContain("Where: HQ Boardroom")
    expect(email.attachments![0]!.filename).toBe("invite.ics")
    expect(icsOf(0)).toContain("DTSTART:20261201T100000Z")
    expect(icsOf(0)).toContain("DTEND:20261201T104000Z")
    expect(icsOf(0)).toContain(`UID:${record.id}@erm.imhogen`)
    expect(icsOf(0)).toContain("SEQUENCE:0")

    expect(
      (await kickoffInviteValues(database, projectId, sent.payload)).inviteSent
    ).toBe("Yes")

    // Pressed again, the same invite is not sent twice.
    await send(record.id)
    expect(transport.sent).toHaveLength(1)
  })

  it("sends an update to the same meeting after the time changes", async () => {
    const record = await draft()
    const sent = await send(record.id)

    const changed = await draft(ready({ meetingTime: "14:30" }), sent)

    await send(changed.id)

    expect(transport.sent).toHaveLength(2)
    expect(icsOf(1)).toContain(`UID:${record.id}@erm.imhogen`)
    expect(icsOf(1)).toContain("SEQUENCE:1")
    expect(icsOf(1)).toContain("DTSTART:20261201T143000Z")
  })

  it("is refused without a date, time or place", async () => {
    const record = await draft({ script: kickoffScriptFor("Rice Mill") })

    await expect(send(record.id)).rejects.toMatchObject({
      missing: [
        "add the meeting date",
        "add the time",
        "add the location or link",
      ],
    })
    await expect(send(record.id)).rejects.toThrow(KickoffInviteNotReadyError)
    expect(transport.sent).toHaveLength(0)
  })

  it("marks nothing sent when the email service refuses", async () => {
    const record = await draft()

    const failing: Transport = {
      name: "failing",
      send: async () => {
        throw new Error("Resend is down")
      },
    }

    await expect(send(record.id, failing)).rejects.toThrow(InviteRefusedError)

    const after = await getRecord(database, pm, record.id)

    expect(after.payload.inviteSentAt).toBeUndefined()

    await send(record.id)

    expect(transport.sent).toHaveLength(1)
  })

  it("lets nobody but the PM send", async () => {
    const le = await addPerson("Kwame Boateng", ["LE"])
    const record = await draft()

    await expect(
      sendKickoffInvite(database, le, record.id, { transport, now: NOW })
    ).rejects.toThrow(PermissionDeniedError)
  })
})

describe("submitting", () => {
  beforeEach(async () => {
    await unblocked()
  })

  it("is refused before the invite is sent or with the room not booked", async () => {
    const unsent = await draft(ready({ roomBooked: "Yes" }))

    expect(
      await refusal(submitRecord(database, pm, unsent.id, transport))
    ).toContain("Send the invite to the rostered engineers first")

    const sent = await send(unsent.id)
    const notBooked = await draft(ready({ roomBooked: "No" }), sent)

    expect(
      await refusal(submitRecord(database, pm, notBooked.id, transport))
    ).toContain("Answer Yes once the room or platform is booked")
  })

  it("locks once the invite has gone and the room is booked", async () => {
    const record = await draft(ready({ roomBooked: "Yes" }))

    await send(record.id)

    const submitted = await submitRecord(database, pm, record.id, transport)

    expect(submitted.state).toBe("locked")
  })
})
