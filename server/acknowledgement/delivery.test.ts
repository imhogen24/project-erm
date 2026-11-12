import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  createFakeTransport,
  type Delivery,
  type DeliveryLookup,
  type FakeTransport,
} from "@/server/email/email"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { ValidationError } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import { sendAcknowledgement } from "./acknowledgement"
import {
  RetryNotAllowedError,
  acknowledgementDelivery,
  checkDeliveries,
  retryAcknowledgement,
} from "./delivery"

// D1.4 delivery tracking (RDP-151). The job asks the email service what
// happened to each D1.4 email still at Sent; the PM fixes the address of one
// that bounced and presses Retry. The email service is always a fake here.
const database = createTestDatabase()

// A stand-in for D1.4 with the fields Send and the delivery check use. The real definition is
// checked in workbooks/wb01/tools/d1-4.test.ts.
tools.registerTool(
  defineTool({
    id: "D1.4",
    name: "Acknowledgement Email",
    workbook: "wb01",
    autosave: true,
    fields: [
      { key: "sentTo", label: "Sent To", type: "email", systemFilled: true },
      { key: "ccBcc", label: "CC / BCC", type: "text" },
      { key: "subject", label: "Subject Line", type: "text", required: true },
      { key: "sentBy", label: "Sent By", type: "text", systemFilled: true },
      { key: "dateSent", label: "Date Sent", type: "date", systemFilled: true },
      { key: "timeSent", label: "Time Sent", type: "time", systemFilled: true },
      {
        key: "deliveryStatus",
        label: "Delivery Status",
        type: "select",
        options: ["Sent", "Delivered", "Bounced"],
        systemFilled: true,
      },
      { key: "body", label: "Body", type: "longText", required: true },
    ],
  })
)

loadUnorderedWorkflow({ wb01: ["D1.4"] })

const WEB_REQUEST = {
  contact_person: "Kwaku Ampofo",
  email: "kwaku.ampofo@temafoods.test",
  project_title: "Packaged boiler skid",
  created_at: "2026-10-31T09:14:00Z",
}

const CORRECTED = "kwaku@temafoods.test"

let projectId: string

let pm: string

let transport: FakeTransport

// Gives the same answer for every email, and keeps the message IDs it was
// asked about.
function answering(answer: Delivery) {
  const asked: string[] = []

  const lookup: DeliveryLookup = {
    name: "fake",
    status: async (messageId) => {
      asked.push(messageId)

      return answer
    },
  }

  return { lookup, asked }
}

const unreachable: DeliveryLookup = {
  name: "unreachable",
  status: async () => {
    throw new Error("fetch failed")
  },
}

// The time the job runs, this many hours after the email went out.
function hoursLater(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

async function addProject(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, $2) RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`, track]
  )

  const id = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
    [id, WEB_REQUEST]
  )

  return id
}

async function addPerson(held: Role[]) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', $1) RETURNING id",
    [`person-${Math.random()}@example.com`]
  )

  for (const role of held) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [rows[0]!.id, projectId, role]
    )
  }

  return rows[0]!.id
}

// D1.4 written by the OM and sent by the PM: locked, with its status at Sent.
async function sentAcknowledgement() {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.4', 'draft', $2) RETURNING id",
    [
      projectId,
      {
        subject: "Acknowledgement of Packaged boiler skid request",
        body: "Dear Kwaku Ampofo,\n\nThank you.",
        ccBcc: "om@imhogen.test",
      },
    ]
  )

  await sendAcknowledgement(database, pm, rows[0]!.id, transport)

  return rows[0]!.id
}

async function payloadOf(recordId: string) {
  const { rows } = await database.pool.query<{
    state: string
    payload: JsonObject
  }>("SELECT state, payload FROM tool_records WHERE id = $1", [recordId])

  return rows[0]!
}

// Oldest first.
async function emailsOf(recordId: string) {
  const { rows } = await database.pool.query<{
    recipient: string
    status: string
  }>(
    "SELECT recipient, status FROM email_log WHERE record_id = $1 ORDER BY created_at, id",
    [recordId]
  )

  return rows
}

async function noticesOf(personId: string, kind: string) {
  const { rows } = await database.pool.query<{
    path: string
    record_id: string | null
  }>(
    "SELECT path, record_id FROM notifications WHERE person_id = $1 AND kind = $2",
    [personId, kind]
  )

  return rows
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  transport = createFakeTransport()
  projectId = await addProject()
  pm = await addPerson(["PM"])
  // Sent By is the project's OM.
  await addPerson(["OM"])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await database.pool.end()
})

describe("the delivery check", () => {
  it("marks a delivered email Delivered, then stops checking it", async () => {
    const id = await sentAcknowledgement()
    const delivered = answering("delivered")

    await checkDeliveries(database, delivered.lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Delivered")
    expect(await emailsOf(id)).toMatchObject([{ status: "delivered" }])
    expect(delivered.asked).toHaveLength(1)

    await checkDeliveries(database, delivered.lookup)

    expect(delivered.asked).toHaveLength(1)
  })

  it("keeps D1.4 locked while it fills in the status", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("delivered").lookup)

    expect((await payloadOf(id)).state).toBe("locked")
  })

  it("marks a bounced email Bounced and tells the PM, with a path to D1.4", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("bounced").lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")
    expect(await emailsOf(id)).toMatchObject([{ status: "bounced" }])
    expect(await noticesOf(pm, "email_bounced")).toEqual([
      { path: `/projects/${projectId}/tools/D1.4`, record_id: id },
    ])
  })

  it("treats a spam complaint as Bounced", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("complained").lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")
    expect(await emailsOf(id)).toMatchObject([{ status: "complained" }])
    expect(await noticesOf(pm, "email_bounced")).toHaveLength(1)
  })

  it("leaves an email with no answer yet at Sent, and checks it again on the next run", async () => {
    const id = await sentAcknowledgement()
    const waiting = answering("sent")

    await checkDeliveries(database, waiting.lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Sent")
    expect(await emailsOf(id)).toMatchObject([{ status: "sent" }])

    await checkDeliveries(database, waiting.lookup)

    expect(waiting.asked).toHaveLength(2)
  })

  it("notifies once and keeps its answer when it runs twice", async () => {
    const id = await sentAcknowledgement()
    const bounced = answering("bounced")

    await Promise.all([
      checkDeliveries(database, bounced.lookup),
      checkDeliveries(database, bounced.lookup),
    ])
    await checkDeliveries(database, answering("delivered").lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")
    expect(await noticesOf(pm, "email_bounced")).toHaveLength(1)
  })

  it("marks a bounce on a project with no PM, and tells nobody", async () => {
    const id = await sentAcknowledgement()

    await database.pool.query(
      "DELETE FROM person_project_roles WHERE role = 'PM'"
    )

    await expect(
      checkDeliveries(database, answering("bounced").lookup)
    ).resolves.toBeDefined()
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")

    const { rows } = await database.pool.query("SELECT 1 FROM notifications")

    expect(rows).toHaveLength(0)
  })

  it("changes nothing when the email service cannot be reached, and tries again next run", async () => {
    const id = await sentAcknowledgement()

    await expect(checkDeliveries(database, unreachable)).resolves.toBeDefined()
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Sent")
    expect(await emailsOf(id)).toMatchObject([{ status: "sent" }])

    await checkDeliveries(database, answering("delivered").lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Delivered")
  })

  it("stops after 72 hours with no answer, leaves it at Sent, and tells the PM once", async () => {
    const id = await sentAcknowledgement()
    const waiting = answering("sent")

    await checkDeliveries(database, waiting.lookup, { now: hoursLater(73) })
    await checkDeliveries(database, waiting.lookup, { now: hoursLater(74) })

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Sent")
    // Asked once more at 72 hours, then never again.
    expect(waiting.asked).toHaveLength(1)
    expect(await noticesOf(pm, "email_unconfirmed")).toEqual([
      { path: `/projects/${projectId}/tools/D1.4`, record_id: id },
    ])
    expect(await acknowledgementDelivery(database, id)).toEqual({
      status: "Sent",
      retry: true,
    })
  })

  it("takes a late answer at 72 hours instead of giving up", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("delivered").lookup, {
      now: hoursLater(73),
    })

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Delivered")
    expect(await noticesOf(pm, "email_unconfirmed")).toHaveLength(0)
  })

  it("does not give up while the email service cannot be reached", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, unreachable, { now: hoursLater(73) })

    expect(await noticesOf(pm, "email_unconfirmed")).toHaveLength(0)
    expect(await acknowledgementDelivery(database, id)).toEqual({
      status: "Sent",
      retry: false,
    })
  })

  it("skips an email whose D1.4 is no longer locked, and still checks the rest", async () => {
    const voided = await sentAcknowledgement()

    await database.pool.query(
      "UPDATE tool_records SET state = 'void' WHERE id = $1",
      [voided]
    )

    projectId = await addProject()
    pm = await addPerson(["PM"])

    const id = await sentAcknowledgement()
    const delivered = answering("delivered")

    await checkDeliveries(database, delivered.lookup)

    expect(delivered.asked).toHaveLength(1)
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Delivered")
    expect((await payloadOf(voided)).payload.deliveryStatus).toBe("Sent")
  })

  it("keeps an older email's answer in the log only, once a Retry sent a newer one", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("sent").lookup, {
      now: hoursLater(73),
    })
    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    // A late answer for the first email, as a check that was still waiting
    // on the service would save it. The new email has no answer yet.
    const { rows } = await database.pool.query<{ message_id: string }>(
      "UPDATE email_log SET unconfirmed_at = NULL WHERE recipient = $1 RETURNING message_id",
      [WEB_REQUEST.email]
    )

    const first = rows[0]!.message_id

    await checkDeliveries(database, {
      name: "fake",
      status: async (messageId) => (messageId === first ? "bounced" : "sent"),
    })

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Sent")
    expect(await emailsOf(id)).toMatchObject([
      { recipient: WEB_REQUEST.email, status: "bounced" },
      { recipient: CORRECTED, status: "sent" },
    ])
  })

  it("logs the email's answer as the system", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("bounced").lookup)

    const { rows } = await database.pool.query(
      `SELECT field, old_value AS "oldValue", new_value AS "newValue"
       FROM audit_log WHERE record_id = $1 AND field = 'email.status'`,
      [id]
    )

    expect(rows).toEqual([
      { field: "email.status", oldValue: "sent", newValue: "bounced" },
    ])
  })

  it("keeps checking before the 72 hours are up", async () => {
    const id = await sentAcknowledgement()
    const waiting = answering("sent")

    await checkDeliveries(database, waiting.lookup, { now: hoursLater(71) })

    expect(waiting.asked).toHaveLength(1)
    expect(await noticesOf(pm, "email_unconfirmed")).toHaveLength(0)
    expect(await acknowledgementDelivery(database, id)).toEqual({
      status: "Sent",
      retry: false,
    })
  })

  it("never sends an email", async () => {
    await sentAcknowledgement()

    await checkDeliveries(database, answering("bounced").lookup)
    await checkDeliveries(database, answering("sent").lookup, {
      now: hoursLater(73),
    })

    expect(transport.sent).toHaveLength(1)
  })
})

describe("Retry", () => {
  async function bounced() {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("bounced").lookup)

    return id
  }

  it("sends the same email to the corrected address and sets it back to Sent", async () => {
    const id = await bounced()

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    expect(transport.sent).toHaveLength(2)
    expect(transport.sent[1]).toMatchObject({
      to: CORRECTED,
      cc: transport.sent[0]!.cc,
      subject: transport.sent[0]!.subject,
      text: transport.sent[0]!.text,
    })

    const { state, payload } = await payloadOf(id)

    expect(state).toBe("locked")
    expect(payload).toMatchObject({
      sentTo: CORRECTED,
      deliveryStatus: "Sent",
    })
    expect(payload.sentBy).toBeDefined()
    expect(payload.dateSent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(payload.timeSent).toMatch(/^\d{2}:\d{2}$/)
    expect(await emailsOf(id)).toMatchObject([
      { recipient: WEB_REQUEST.email, status: "bounced" },
      { recipient: CORRECTED, status: "sent" },
    ])
  })

  it("logs who retried, with the old and the new address", async () => {
    const id = await bounced()

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    const { rows } = await database.pool.query(
      `SELECT actor_id AS "actorId", old_value AS "oldValue",
       new_value AS "newValue" FROM audit_log
       WHERE record_id = $1 AND field = 'payload.sentTo'
       AND old_value IS NOT NULL`,
      [id]
    )

    expect(rows).toEqual([
      { actorId: pm, oldValue: WEB_REQUEST.email, newValue: CORRECTED },
    ])
  })

  it("checks the new email on the next run, and not the old one", async () => {
    const id = await bounced()

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    const delivered = answering("delivered")

    await checkDeliveries(database, delivered.lookup)

    expect(delivered.asked).toHaveLength(1)
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Delivered")
  })

  it("sends once when pressed twice", async () => {
    const id = await bounced()

    await Promise.allSettled([
      retryAcknowledgement(database, pm, id, CORRECTED, transport),
      retryAcknowledgement(database, pm, id, CORRECTED, transport),
    ])

    expect(transport.sent).toHaveLength(2)
  })

  it("sends one of two retries at once to different addresses, and keeps its address", async () => {
    const id = await bounced()
    const other = await addPerson(["PM"])

    const results = await Promise.allSettled([
      retryAcknowledgement(database, pm, id, CORRECTED, transport),
      retryAcknowledgement(
        database,
        other,
        id,
        "ops@temafoods.test",
        transport
      ),
    ])

    expect(transport.sent).toHaveLength(2)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
    expect((await payloadOf(id)).payload.sentTo).toBe(transport.sent[1]!.to)
  })

  it("keeps a refused retry's address, and sends the next press to the new one", async () => {
    const id = await bounced()

    const refusing = {
      name: "refusing",
      send: async () => {
        throw new Error("Domain not verified")
      },
    }

    await expect(
      retryAcknowledgement(database, pm, id, "ops@temafoods.test", refusing)
    ).rejects.toThrow(/Domain not verified/)
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    expect(transport.sent[1]?.to).toBe(CORRECTED)
    expect((await payloadOf(id)).payload.sentTo).toBe(CORRECTED)
    expect(await emailsOf(id)).toMatchObject([
      { recipient: WEB_REQUEST.email, status: "bounced" },
      { recipient: "ops@temafoods.test", status: "failed" },
      { recipient: CORRECTED, status: "sent" },
    ])
  })

  it("refuses to retry to the same address after a spam complaint", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("complained").lookup)

    await expect(
      retryAcknowledgement(database, pm, id, WEB_REQUEST.email, transport)
    ).rejects.toThrow(/marked this email as spam/)
    expect(transport.sent).toHaveLength(1)

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    expect(transport.sent[1]?.to).toBe(CORRECTED)
  })

  it("bounces again and tells the PM again when the corrected address bounces too", async () => {
    const id = await bounced()

    await retryAcknowledgement(database, pm, id, CORRECTED, transport)
    await checkDeliveries(database, answering("bounced").lookup)

    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")
    expect(await noticesOf(pm, "email_bounced")).toHaveLength(2)
  })

  it("is allowed once the 72 hours passed with no answer", async () => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering("sent").lookup, {
      now: hoursLater(73),
    })
    await retryAcknowledgement(database, pm, id, CORRECTED, transport)

    expect(transport.sent[1]?.to).toBe(CORRECTED)
  })

  it.each<[string, Delivery]>([
    ["Sent", "sent"],
    ["Delivered", "delivered"],
  ])("is refused while the email is %s", async (status, answer) => {
    const id = await sentAcknowledgement()

    await checkDeliveries(database, answering(answer).lookup)

    expect(await acknowledgementDelivery(database, id)).toEqual({
      status,
      retry: false,
    })
    await expect(
      retryAcknowledgement(database, pm, id, CORRECTED, transport)
    ).rejects.toThrow(RetryNotAllowedError)
    expect(transport.sent).toHaveLength(1)
  })

  it("is open after a bounce", async () => {
    const id = await bounced()

    expect(await acknowledgementDelivery(database, id)).toEqual({
      status: "Bounced",
      retry: true,
    })
  })

  it.each<[string, Role[]]>([
    ["the OM", ["OM"]],
    ["the client", ["Client"]],
  ])("is refused for %s", async (_, held) => {
    const id = await bounced()
    const person = await addPerson(held)

    await expect(
      retryAcknowledgement(database, person, id, CORRECTED, transport)
    ).rejects.toThrow(PermissionDeniedError)
    expect(transport.sent).toHaveLength(1)
    expect((await payloadOf(id)).payload.deliveryStatus).toBe("Bounced")
  })

  it("refuses an address that is not an email, and sends nothing", async () => {
    const id = await bounced()

    await expect(
      retryAcknowledgement(database, pm, id, "kwaku at temafoods", transport)
    ).rejects.toThrow(ValidationError)
    expect(transport.sent).toHaveLength(1)
    expect((await payloadOf(id)).payload).toMatchObject({
      sentTo: WEB_REQUEST.email,
      deliveryStatus: "Bounced",
    })
  })
})
