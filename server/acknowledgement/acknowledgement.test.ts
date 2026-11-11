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
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import { ValidationError } from "@/server/records/records"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"
import { loadUnorderedWorkflow } from "@/server/workflow/testing"

import {
  EmailRefusedError,
  SENT,
  SendNotReadyError,
  acknowledgementDraft,
  draftFrom,
  sendAcknowledgement,
} from "./acknowledgement"

const database = createTestDatabase()

// A stand-in for D1.4 with the fields Send reads. The real definition is
// checked in workbooks/wb01/tools/d1-4.test.ts.
tools.registerTool(
  defineTool({
    id: "D1.4",
    name: "Acknowledgement Email",
    workbook: "wb01",
    autosave: true,
    fields: [
      { key: "ccBcc", label: "CC / BCC", type: "text" },
      { key: "subject", label: "Subject Line", type: "text", required: true },
      { key: "body", label: "Body", type: "longText", required: true },
    ],
  })
)

loadUnorderedWorkflow({ wb01: ["D1.4"] })

let projectId: string

let transport: FakeTransport

const WEB_REQUEST = {
  contact_person: "Kwaku Ampofo",
  email: "kwaku.ampofo@temafoods.test",
  project_title: "Packaged boiler skid",
  created_at: "2026-10-31T09:14:00Z",
}

async function addProject(
  track: "Tier_1" | "Tier_3" = "Tier_1",
  submission: JsonObject | null = WEB_REQUEST
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Tema Foods Boiler Skid', $1, $2) RETURNING id",
    [`T1-${Math.round(Math.random() * 1e12)}`, track]
  )

  const id = rows[0]!.id

  if (submission) {
    await database.pool.query(
      "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) SELECT request_id, service_track, id, $2 FROM projects WHERE id = $1",
      [id, submission]
    )
  }

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

const ready = {
  subject: "Acknowledgement of Packaged boiler skid request",
  body: "Dear Kwaku Ampofo,\n\nThank you.",
}

async function addDraft(payload: JsonObject = ready) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, 'D1.4', 'draft', $2) RETURNING id",
    [projectId, payload]
  )

  return rows[0]!.id
}

async function emailOf(personId: string) {
  const { rows } = await database.pool.query<{ email: string }>(
    "SELECT email FROM people WHERE id = $1",
    [personId]
  )

  return rows[0]!.email
}

async function recordOf(id: string) {
  const { rows } = await database.pool.query<{
    state: string
    payload: JsonObject
    approved_by: string | null
    submitted_by: string | null
  }>(
    "SELECT state, payload, approved_by, submitted_by FROM tool_records WHERE id = $1",
    [id]
  )

  return rows[0]!
}

beforeEach(async () => {
  await resetTestData(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  transport = createFakeTransport()
  projectId = await addProject()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await database.pool.end()
})

describe("the draft", () => {
  it("fills the subject and the template from the web request", async () => {
    const draft = await acknowledgementDraft(database, projectId)

    expect(draft.sentTo).toBe("kwaku.ampofo@temafoods.test")
    expect(draft.subject).toBe(
      "Acknowledgement of Packaged boiler skid request"
    )
    expect(draft.body).toContain("Dear Kwaku Ampofo,")
    expect(draft.body).toContain(
      "regarding Packaged boiler skid submitted on Saturday, Oct 31, 2026 at 9:14 AM."
    )
    expect(draft.body).toContain("tracking reference: T1-")
    expect(draft.body).toContain("We look forward to collaborating with you.")
    expect(draft.body.endsWith("Best regards")).toBe(true)
    expect(draft.body).not.toContain("measure")
  })

  it("leaves a visible blank for a value the web request does not hold", () => {
    const draft = draftFrom({ requestId: "T1-1" })

    expect(draft.body).toContain("Dear [Client Name],")
    expect(draft.body).toContain("regarding [Project/Product Name]")
    expect(draft.body).toContain("submitted on [Date of Submission].")
    expect(draft.subject).toBe(
      "Acknowledgement of [Project/Product Name] request"
    )
  })

  it("uses the project's name on Tier 3, whose form has no title", async () => {
    projectId = await addProject("Tier_3", { email: "x@example.com" })

    const draft = await acknowledgementDraft(database, projectId)

    expect(draft.subject).toBe(
      "Acknowledgement of Tema Foods Boiler Skid request"
    )
  })

  it("names the project's OM as the one it is sent by, and nobody when there is no OM", async () => {
    expect((await acknowledgementDraft(database, projectId)).sentBy).toBeNull()

    const om = await addPerson(["OM"])

    expect((await acknowledgementDraft(database, projectId)).sentBy).toBe(
      await emailOf(om)
    )
  })

  it("has no address when the web request holds none", async () => {
    projectId = await addProject("Tier_1", null)

    expect((await acknowledgementDraft(database, projectId)).sentTo).toBeNull()
  })
})

describe("Send", () => {
  it("emails the client once, with the copies, then records it and locks D1.4", async () => {
    const om = await addPerson(["OM"])
    const pm = await addPerson(["PM"])

    const id = await addDraft({
      ...ready,
      ccBcc: "om@imhogen.test, pm@imhogen.test",
    })

    await sendAcknowledgement(database, pm, id, transport)

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: "kwaku.ampofo@temafoods.test",
      cc: ["om@imhogen.test", "pm@imhogen.test"],
      subject: ready.subject,
      text: ready.body,
    })

    const saved = await recordOf(id)

    expect(saved.state).toBe("locked")
    expect(saved.approved_by).toBe(pm)
    expect(saved.submitted_by).toBeNull()
    expect(saved.payload).toMatchObject({
      sentTo: "kwaku.ampofo@temafoods.test",
      sentBy: await emailOf(om),
      deliveryStatus: SENT,
      subject: ready.subject,
    })
    expect(saved.payload.dateSent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(saved.payload.timeSent).toMatch(/^\d{2}:\d{2}$/)
  })

  it("sends once when pressed twice", async () => {
    const pm = await addPerson(["PM"])
    const id = await addDraft()

    await Promise.allSettled([
      sendAcknowledgement(database, pm, id, transport),
      sendAcknowledgement(database, pm, id, transport),
    ])
    await sendAcknowledgement(database, pm, id, transport)

    expect(transport.sent).toHaveLength(1)
    expect((await recordOf(id)).state).toBe("locked")
  })

  it("leaves D1.4 a draft when the email service refuses, and sends on the next press", async () => {
    const pm = await addPerson(["PM"])
    const id = await addDraft()

    const refusing: Transport = {
      name: "refusing",
      send: async () => {
        throw new Error("Domain not verified")
      },
    }

    await expect(
      sendAcknowledgement(database, pm, id, refusing)
    ).rejects.toThrow(EmailRefusedError)
    await expect(
      sendAcknowledgement(database, pm, id, refusing)
    ).rejects.toThrow(/Domain not verified/)

    const kept = await recordOf(id)

    expect(kept.state).toBe("draft")
    expect(kept.payload.deliveryStatus).toBeUndefined()

    await sendAcknowledgement(database, pm, id, transport)

    expect(transport.sent).toHaveLength(1)
    expect((await recordOf(id)).state).toBe("locked")
  })

  it("is refused while the subject or the text is empty, and says what is missing", async () => {
    const pm = await addPerson(["PM"])
    const id = await addDraft({ subject: "Hello", body: "  " })

    await expect(
      sendAcknowledgement(database, pm, id, transport)
    ).rejects.toThrow(SendNotReadyError)
    await expect(
      sendAcknowledgement(database, pm, id, transport)
    ).rejects.toThrow(/add the email text/)
    expect(transport.sent).toHaveLength(0)
  })

  it("is refused when the web request has no email", async () => {
    projectId = await addProject("Tier_1", null)

    const pm = await addPerson(["PM"])
    const id = await addDraft()

    await expect(
      sendAcknowledgement(database, pm, id, transport)
    ).rejects.toThrow(/client's email is missing/)
  })

  it("emails nothing when the project is not active", async () => {
    const pm = await addPerson(["PM"])
    const id = await addDraft()

    await database.pool.query(
      "UPDATE projects SET status = 'on_hold' WHERE id = $1",
      [projectId]
    )

    await expect(
      sendAcknowledgement(database, pm, id, transport)
    ).rejects.toThrow(/on hold/)
    expect(transport.sent).toHaveLength(0)
    expect((await recordOf(id)).state).toBe("draft")
  })

  it("refuses a bad CC / BCC address and sends nothing", async () => {
    const pm = await addPerson(["PM"])

    const id = await addDraft({
      ...ready,
      ccBcc: "om@imhogen.test, not-an-email",
    })

    await expect(
      sendAcknowledgement(database, pm, id, transport)
    ).rejects.toThrow(ValidationError)
    expect(transport.sent).toHaveLength(0)
    expect((await recordOf(id)).state).toBe("draft")
  })

  it.each<[string, Role[]]>([
    ["the OM", ["OM"]],
    ["the client", ["Client"]],
    ["someone else on the project", ["LE"]],
  ])("is refused for %s", async (_, held) => {
    const person = await addPerson(held)
    const id = await addDraft()

    await expect(
      sendAcknowledgement(database, person, id, transport)
    ).rejects.toThrow(PermissionDeniedError)
    expect(transport.sent).toHaveLength(0)
  })
})
