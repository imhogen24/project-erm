import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  decideChange,
  requestChange,
} from "@/server/change-requests/change-requests"
import { createFakeTransport, type Transport } from "@/server/email/email"
import {
  SelfApprovalError,
  approveRecord,
  createRecord,
  getRecord,
  submitRecord,
} from "@/server/records/records"
import { assignStaff } from "@/server/staff/staff"
import { registerTestTools } from "@/server/tools/testing"
import { loadWorkflow } from "@/server/workflow/workflow"

import { listNotifications } from "./notifications"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.1", "D1.2", "D1.3", "D1.4", "D1.9"] })

// One tool after another, as in the real route. D1.9, which the HE approves
// rather than the PM, is open from the start.
const route = [
  { tool: "D1.9" },
  { tool: "D1.1" },
  { tool: "D1.2", after: { all: ["D1.1"] } },
  { tool: "D1.3", after: { all: ["D1.2"] } },
  { tool: "D1.4", after: { all: ["D1.3"] } },
]

// Locking D1.2 opens D1.1, which the Client and the OM write, and D1.3. D1.4
// is open from the start, so locking D1.2 does not open it.
const fork = [
  { tool: "D1.2" },
  { tool: "D1.4" },
  { tool: "D1.9" },
  { tool: "D1.1", after: { all: ["D1.2"] } },
  { tool: "D1.3", after: { all: ["D1.2"] } },
]

let projectId: string

type Person = { id: string; email: string }

async function addProject(name = "Conveyor") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ($1, $2, 'Tier_1') RETURNING id",
    [name, `T1-${crypto.randomUUID()}`]
  )

  return rows[0]!.id
}

async function addPerson(
  onProject: readonly Role[] = [],
  companyWide: readonly Role[] = []
): Promise<Person> {
  const email = `person-${crypto.randomUUID()}@example.com`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [email]
  )

  const id = rows[0]!.id

  for (const role of onProject) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [id, projectId, role]
    )
  }

  for (const role of companyWide) {
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [id, role]
    )
  }

  return { id, email }
}

async function notificationCount() {
  const { rows } = await database.pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM notifications"
  )

  return rows[0]!.count
}

async function emails() {
  const { rows } = await database.pool.query<{
    recipient: string
    kind: string
    status: string
    key: string
  }>("SELECT recipient, kind, status, key FROM email_log")

  return rows
}

async function draftOf(writer: Person, toolId = "D1.1") {
  const record = await createRecord(database, writer.id, {
    projectId,
    toolId,
    payload: { note: "Ready" },
  })

  return record.id
}

// Written and submitted by the writer, then approved and locked by the PM.
async function approvedBy(pm: Person, writer: Person, toolId = "D1.1") {
  const recordId = await draftOf(writer, toolId)

  await submitRecord(database, writer.id, recordId, createFakeTransport())
  await approveRecord(database, pm.id, recordId)

  return recordId
}

async function opened(personId: string) {
  const list = await listNotifications(database, personId)

  return list
    .filter((notification) => notification.kind === "tool_open")
    .map((notification) => [notification.title, notification.path])
    .sort()
}

function failingTransport(): Transport {
  return {
    name: "failing",
    send: async () => {
      throw new Error("Resend is down")
    },
  }
}

beforeEach(async () => {
  await resetTestData(database)

  loadWorkflow([{ workbook: "wb01", tools: route }])

  projectId = await addProject()
})

afterAll(async () => {
  await database.pool.end()
})

describe("assignStaff", () => {
  let admin: Person

  beforeEach(async () => {
    admin = await addPerson([], ["IT/Admin"])
  })

  it("gives the person assigned an assigned notification and one email", async () => {
    const person = await addPerson([], ["PM"])
    const transport = createFakeTransport()

    await assignStaff(
      database,
      admin.id,
      { projectId, personId: person.id, role: "PM" },
      transport
    )

    const [notification, ...others] = await listNotifications(
      database,
      person.id
    )

    expect(others).toEqual([])
    expect(notification).toMatchObject({
      kind: "assigned",
      title: "You were assigned as PM on Conveyor",
      projectId,
      path: `/projects/${projectId}`,
    })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({ to: person.email })
    expect(transport.sent[0]!.subject).toContain("Conveyor")
    expect(transport.sent[0]!.text).toContain(`/projects/${projectId}`)

    expect(await emails()).toEqual([
      {
        recipient: person.email,
        kind: "assigned",
        status: "sent",
        key: notification!.id,
      },
    ])
  })

  it("still assigns and notifies when the email fails, and logs it as failed", async () => {
    const person = await addPerson([], ["PM"])

    await assignStaff(
      database,
      admin.id,
      { projectId, personId: person.id, role: "PM" },
      failingTransport()
    )

    expect(await listNotifications(database, person.id)).toHaveLength(1)
    expect(await emails()).toEqual([
      expect.objectContaining({ kind: "assigned", status: "failed" }),
    ])
  })

  it("notifies nobody when the person already holds the role", async () => {
    const person = await addPerson(["OM"], ["OM"])
    const transport = createFakeTransport()

    await assignStaff(
      database,
      admin.id,
      { projectId, personId: person.id, role: "OM" },
      transport
    )

    expect(await listNotifications(database, person.id)).toEqual([])
    expect(transport.sent).toEqual([])
  })

  it("does not notify an IT/Admin who assigns themselves", async () => {
    const self = await addPerson([], ["IT/Admin", "PM"])
    const transport = createFakeTransport()

    await assignStaff(
      database,
      self.id,
      { projectId, personId: self.id, role: "PM" },
      transport
    )

    expect(await listNotifications(database, self.id)).toEqual([])
    expect(transport.sent).toEqual([])
  })
})

describe("submitting a record", () => {
  it("gives the PM an approval_needed linking to the record, and one email", async () => {
    const pm = await addPerson(["PM"])
    const om = await addPerson(["OM"])
    const recordId = await draftOf(om)
    const transport = createFakeTransport()

    await submitRecord(database, om.id, recordId, transport)

    const [notification, ...others] = await listNotifications(database, pm.id)

    expect(others).toEqual([])
    expect(notification).toMatchObject({
      kind: "approval_needed",
      title: "D1.1 is waiting for your approval",
      projectId,
      recordId,
      path: `/projects/${projectId}/tools/D1.1`,
    })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({ to: pm.email })
    expect(transport.sent[0]!.text).toContain(
      `/projects/${projectId}/tools/D1.1`
    )

    expect(await emails()).toEqual([
      {
        recipient: pm.email,
        kind: "approval_needed",
        status: "sent",
        key: notification!.id,
      },
    ])
  })

  it("still submits and notifies when the email fails, and logs it as failed", async () => {
    const pm = await addPerson(["PM"])
    const om = await addPerson(["OM"])
    const recordId = await draftOf(om)

    const submitted = await submitRecord(
      database,
      om.id,
      recordId,
      failingTransport()
    )

    expect(submitted.state).toBe("submitted")
    expect(await listNotifications(database, pm.id)).toHaveLength(1)
    expect(await emails()).toEqual([
      expect.objectContaining({ kind: "approval_needed", status: "failed" }),
    ])
  })

  it("still submits on a project with no PM, and notifies nobody", async () => {
    const om = await addPerson(["OM"])
    const recordId = await draftOf(om)
    const transport = createFakeTransport()

    const submitted = await submitRecord(database, om.id, recordId, transport)

    expect(submitted.state).toBe("submitted")
    expect(await notificationCount()).toBe(0)
    expect(transport.sent).toEqual([])
  })

  it("notifies whoever approves the tool, not the PM, when someone else approves it", async () => {
    const pm = await addPerson(["PM"])
    const he = await addPerson(["HE"])
    const om = await addPerson(["OM"])
    const recordId = await draftOf(om, "D1.9")
    const transport = createFakeTransport()

    await submitRecord(database, om.id, recordId, transport)

    expect(await listNotifications(database, he.id)).toEqual([
      expect.objectContaining({
        kind: "approval_needed",
        title: "D1.9 is waiting for your approval",
        recordId,
      }),
    ])
    expect(await listNotifications(database, pm.id)).toEqual([])
    expect(transport.sent.map((email) => email.to)).toEqual([he.email])
  })

  it("does not notify a PM who submits the record themselves", async () => {
    const both = await addPerson(["PM", "OM"])
    const recordId = await draftOf(both)
    const transport = createFakeTransport()

    await submitRecord(database, both.id, recordId, transport)

    expect(await listNotifications(database, both.id)).toEqual([])
    expect(transport.sent).toEqual([])
  })
})

describe("approving a record", () => {
  it("gives each person who writes the tool that opens a tool_open for it", async () => {
    const pm = await addPerson(["PM"])
    const om = await addPerson(["OM"])
    const secondOm = await addPerson(["OM"])

    await approvedBy(pm, om)

    const d12 = [["D1.2 is open", `/projects/${projectId}/tools/D1.2`]]

    expect(await opened(om.id)).toEqual(d12)
    expect(await opened(secondOm.id)).toEqual(d12)
    expect(await opened(pm.id)).toEqual([])
  })

  it("names each tool that opens once, and leaves out tools already open", async () => {
    loadWorkflow([{ workbook: "wb01", tools: fork }])

    const pm = await addPerson(["PM"])
    const om = await addPerson(["OM"])

    await approvedBy(pm, om, "D1.2")

    expect(await opened(om.id)).toEqual([
      ["D1.1 is open", `/projects/${projectId}/tools/D1.1`],
      ["D1.3 is open", `/projects/${projectId}/tools/D1.3`],
    ])
  })

  it("never notifies the client, even for a tool they write", async () => {
    loadWorkflow([{ workbook: "wb01", tools: fork }])

    const pm = await addPerson(["PM"])
    const om = await addPerson(["OM"])
    const client = await addPerson(["Client"])

    await approvedBy(pm, om, "D1.2")

    expect(await listNotifications(database, client.id)).toEqual([])
  })
})

describe("change requests", () => {
  const reason = "The request date is wrong"

  let pm: Person

  let om: Person

  let recordId: string

  beforeEach(async () => {
    pm = await addPerson(["PM"])
    om = await addPerson(["OM"])
    recordId = await approvedBy(pm, om)
  })

  async function latest(personId: string, kind: string) {
    const list = await listNotifications(database, personId)

    return list.filter((notification) => notification.kind === kind)
  }

  it("gives the PM a change_waiting when a writer asks for a change", async () => {
    await requestChange(database, om.id, recordId, reason)

    expect(await latest(pm.id, "change_waiting")).toEqual([
      expect.objectContaining({
        title: "A change to D1.1 is waiting for your decision",
        text: reason,
        projectId,
        recordId,
        path: `/projects/${projectId}/tools/D1.1`,
      }),
    ])
  })

  it("tells the person who asked that it was approved", async () => {
    const request = await requestChange(database, om.id, recordId, reason)

    await decideChange(database, pm.id, request.id, { outcome: "approved" })

    expect(await latest(om.id, "change_decided")).toEqual([
      expect.objectContaining({
        title: "Your change to D1.1 was approved",
        text: null,
        recordId,
        path: `/projects/${projectId}/tools/D1.1`,
      }),
    ])
    expect(await latest(pm.id, "change_decided")).toEqual([])
  })

  it("tells the person who asked that it was rejected, with the reason", async () => {
    const request = await requestChange(database, om.id, recordId, reason)

    await decideChange(database, pm.id, request.id, {
      outcome: "rejected",
      reason: "The date matches the website",
    })

    expect(await latest(om.id, "change_decided")).toEqual([
      expect.objectContaining({
        title: "Your change to D1.1 was rejected",
        text: "The date matches the website",
      }),
    ])
  })

  it("never tells the client, who may ask for a change to a tool they write", async () => {
    const client = await addPerson(["Client"])
    const request = await requestChange(database, client.id, recordId, reason)

    await decideChange(database, pm.id, request.id, { outcome: "approved" })

    expect(await latest(pm.id, "change_waiting")).toHaveLength(1)
    expect(await listNotifications(database, client.id)).toEqual([])
  })
})

describe("an action that fails", () => {
  it("writes no notification", async () => {
    const both = await addPerson(["PM", "OM"])
    const om = await addPerson(["OM"])
    const recordId = await draftOf(both)

    await submitRecord(database, both.id, recordId, createFakeTransport())

    await expect(approveRecord(database, both.id, recordId)).rejects.toThrow(
      SelfApprovalError
    )

    expect(await listNotifications(database, om.id)).toEqual([])
    expect(await notificationCount()).toBe(0)
  })

  it("is rolled back with its change when the notification cannot be written", async () => {
    await addPerson(["PM"])

    const om = await addPerson(["OM"])
    const recordId = await draftOf(om)

    await database.pool.query(`
      CREATE FUNCTION refuse_notifications() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'notifications are refused in this test';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER refuse_notifications BEFORE INSERT ON notifications
        FOR EACH ROW EXECUTE FUNCTION refuse_notifications();
    `)

    try {
      await expect(
        submitRecord(database, om.id, recordId, createFakeTransport())
      ).rejects.toThrow()
    } finally {
      await database.pool.query(`
        DROP TRIGGER refuse_notifications ON notifications;
        DROP FUNCTION refuse_notifications();
      `)
    }

    expect((await getRecord(database, om.id, recordId)).state).toBe("draft")
    expect(await emails()).toEqual([])
  })
})
