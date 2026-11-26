import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { addDays, daysIn, followedDate, nextFollowed } from "@/lib/follow-dates"
import { launchTasks } from "@/lib/initiation"
import { initiationStart, initiationValues } from "@/server/contract/initiation"
import { createFakeTransport, type FakeTransport } from "@/server/email/email"
import { listNotifications } from "@/server/notifications/notifications"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  saveDraft,
  signField,
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

let projectId: string

let ca: string

let fo: string

let pm: string

let transport: FakeTransport

const rows = z.array(z.record(z.string(), z.unknown()))

async function addProject() {
  const requestId = `Tier_1-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, 'Tier_1') RETURNING id",
    [requestId]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, 'Tier_1', $2, $3)",
    [requestId, rows[0]!.id, { organization_name: "Asante Mills" }]
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
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z')",
    [projectId, toolId, payload]
  )
}

// Everything before D2.14 locked: the contract worth GHS 94,400.00 with 40%
// due on execution, D2.6's 8-week timeline, and D2.12's invoice.
async function reachInitiation() {
  await addRecord("D1.16")
  await addRecord("D2.1", { executionPercentage: 40 })
  await addRecord("D2.2", {
    coreVariables: [
      { variable: "Client Legal Name", value: "Asante Mills" },
      { variable: "Client Representative", value: "Kwaku Ampofo" },
      { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
    ],
  })
  await addRecord("D2.6", {
    baseline: [
      {
        variable: "Total Contract Value (GHS)",
        baselineValue: "GHS 94,400.00",
      },
      { variable: "Advance Payment %", baselineValue: "40%" },
      { variable: "Total Project Timeline", baselineValue: "40 Working Days" },
    ],
  })

  for (const toolId of ["D2.3", "D2.4", "D2.5", "D2.8", "D2.10", "D2.11"]) {
    await addRecord(toolId)
  }

  await addRecord("D2.7", { initialResponse: "Requested Negotiation" })
  await addRecord("D2.9", { meetingOutcome: "Terms Agreed - Proceed to D2.10" })
  await addRecord("D2.12", { invoiceNumber: "IMHO-INV26-ADV-011" })
  await addRecord("D2.13")
}

function notice(values: JsonObject = {}): JsonObject {
  return {
    invoiceNumber: "IMHO-INV26-ADV-011",
    amountExpected: 37760,
    paymentDate: "2026-12-14",
    startDate: "2026-12-14",
    targetDate: "2027-01-23",
    launchTasks: launchTasks.map((row, index) => ({
      ...row,
      status: index === 0 ? "Done" : "Pending",
    })),
    authorized: "Yes",
    ...values,
  }
}

async function draft(values: JsonObject = notice()) {
  return saveDraft(database, ca, {
    projectId,
    toolId: "D2.14",
    cycle: 1,
    values,
  })
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.errors.map((each) => each.field)
    }

    throw error
  }

  throw new Error("Expected a refusal")
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  transport = createFakeTransport()
  projectId = await addProject()
  ca = await addPerson("Gifty Ofori", ["CA"])
  fo = await addPerson("Esi Badu", ["FO"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.15", { budget: [{ value: 94400 }] })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("dates that follow", () => {
  it("reads the days a timeline holds", () => {
    expect(daysIn("40 Working Days")).toBe(40)
    expect(daysIn("8 weeks")).toBe(56)
    expect(daysIn("1 day")).toBe(1)
    expect(daysIn("Two months")).toBeUndefined()
    expect(addDays("2026-12-14", 40)).toBe("2027-01-23")
  })

  // Plays a run of changes to what a date follows, with the person's own
  // edits between them, and gives what the date shows after each.
  function play(steps: ({ source: string } | { typed: string })[]) {
    let current = ""
    let applied: string | undefined
    let source = ""
    const shown: string[] = []

    for (const step of steps) {
      if ("typed" in step) {
        current = step.typed
      } else {
        source = step.source
      }

      const next = nextFollowed({
        current,
        next: source === "" ? undefined : source,
        applied,
      })

      current = next.value ?? current
      applied = next.applied
      shown.push(current)
    }

    return shown
  }

  it("keeps a date typed by hand however the date it followed changes", () => {
    expect(
      play([
        { source: "2026-12-14" },
        { typed: "2026-12-16" },
        { source: "2026-12-16" },
        { source: "2026-12-17" },
      ])
    ).toEqual(["2026-12-14", "2026-12-16", "2026-12-16", "2026-12-16"])
  })

  it("goes on following once what it follows is cleared and filled again", () => {
    expect(
      play([{ source: "2026-12-14" }, { source: "" }, { source: "2026-12-20" }])
    ).toEqual(["2026-12-14", "2026-12-14", "2026-12-20"])
  })

  it("follows the date, plus the duration's days when it names one", () => {
    const values = new Map([
      ["paymentDate", "2026-12-14"],
      ["startDate", "2026-12-15"],
      ["totalTimeline", "40 Working Days"],
    ])

    const read = (key: string) => values.get(key) ?? ""

    expect(followedDate({ key: "startDate", field: "paymentDate" }, read)).toBe(
      "2026-12-14"
    )
    expect(
      followedDate(
        {
          key: "targetDate",
          field: "startDate",
          plusDurationOf: "totalTimeline",
        },
        read
      )
    ).toBe("2027-01-24")
    expect(
      followedDate({ key: "startDate", field: "missing" }, read)
    ).toBeUndefined()
  })
})

describe("where it starts", () => {
  beforeEach(reachInitiation)

  it("opens once D2.13 locks", async () => {
    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.14")
  })

  it("starts on D2.12's invoice number and the advance due", async () => {
    expect(await initiationStart(database, projectId)).toEqual({
      invoiceNumber: "IMHO-INV26-ADV-011",
      amountExpected: 37760,
    })
  })

  it("shows the PM and D2.6's timeline, and the notice date once submitted", async () => {
    const before = await initiationValues(database, projectId, null)

    expect(before).toMatchObject({
      assignedPm: "Ama Owusu",
      totalTimeline: "40 Working Days",
    })
    expect(before).not.toHaveProperty("noticeDate")

    const record = await draft()
    const submitted = await submitRecord(database, ca, record.id)

    const after = await initiationValues(database, projectId, {
      id: submitted.id,
      payload: submitted.payload,
    })

    expect(after.noticeDate).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe("submitting", () => {
  beforeEach(reachInitiation)

  it("refuses while a field is empty, the first task is Pending, or 5.0 is No", async () => {
    const unpaid = notice({
      launchTasks: launchTasks.map((row) => ({ ...row, status: "Pending" })),
      authorized: "No",
    })

    delete unpaid.paymentDate

    const record = await draft(unpaid)

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "paymentDate",
    ])

    await updateRecord(
      database,
      ca,
      record.id,
      notice({
        launchTasks: launchTasks.map((row) => ({ ...row, status: "Pending" })),
        authorized: "No",
      })
    )

    expect(await refusal(submitRecord(database, ca, record.id))).toEqual([
      "launchTasks",
      "authorized",
    ])
  })

  it("keeps the PM's task as the app set it, whatever the form sends", async () => {
    const record = await draft(
      notice({
        launchTasks: launchTasks.map((row) => ({ ...row, status: "Done" })),
      })
    )

    const tasks = rows.parse(record.payload.launchTasks)

    expect(tasks[0]).toMatchObject({ status: "Done" })
    expect(tasks[1]).toMatchObject({ status: "Pending" })
  })
})

describe("signing in turn", () => {
  beforeEach(reachInitiation)

  it("asks the FO, then the PM, whose signature locks it and marks the PM's task Done", async () => {
    const record = await draft()

    await expect(
      signField(database, fo, record.id, "financeSignature")
    ).rejects.toThrow("is signed once the record is submitted")

    await submitRecord(database, ca, record.id, transport)

    expect(await listNotifications(database, fo)).toEqual([
      expect.objectContaining({ title: "D2.14 is waiting for your signature" }),
    ])
    expect(transport.sent.map((each) => each.to)).toContain(
      "esi.badu@imhogen.test"
    )

    await expect(
      signField(database, pm, record.id, "greenLightSignature")
    ).rejects.toThrow("is signed after Finance Clearance Signature")
    await expect(
      signField(database, ca, record.id, "financeSignature")
    ).rejects.toBeInstanceOf(PermissionDeniedError)

    await signField(database, fo, record.id, "financeSignature")

    const locked = await signField(
      database,
      pm,
      record.id,
      "greenLightSignature"
    )

    expect(locked.state).toBe("locked")

    const tasks = rows.parse(locked.payload.launchTasks)

    expect(tasks[1]).toMatchObject({ status: "Done" })

    const values = await initiationValues(database, projectId, {
      id: locked.id,
      payload: locked.payload,
    })

    expect(values.signedDate).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM approve it, the FO and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const client = await addPerson("Kwaku Ampofo", ["Client"])
    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, ca, projectId, "D2.14", "write")).toBe(true)
    expect(await can(database, pm, projectId, "D2.14", "approve")).toBe(true)

    for (const reader of [fo, pm, cr]) {
      expect(await can(database, reader, projectId, "D2.14", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.14", "write")).toBe(
        false
      )
    }

    for (const other of [client, om]) {
      expect(await can(database, other, projectId, "D2.14", "read")).toBe(false)
    }
  })
})
