import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { fileReference } from "@/lib/file-reference"
import { COURIER, DIGITAL, signatureScriptFor } from "@/lib/signature-contract"
import {
  EmailRefusedError,
  SendNotReadyError,
  addressIn,
  sendSignatureReminders,
  sendSignatureRequest,
  signatureStart,
  signatureValues,
} from "@/server/contract/signature-contract"
import {
  createFakeTransport,
  type FakeTransport,
  type Transport,
} from "@/server/email/email"
import type { Storages } from "@/server/files/storage"
import { listNotifications } from "@/server/notifications/notifications"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  RecordNotEditableError,
  ValidationError,
  getRecord,
  recordViewed,
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
]) {
  tools.registerTool(tool)
}

loadUnorderedWorkflow({ wb01: ["D1.15", "T3.D1.15a", "D1.16"] })

const CLIENT_EMAIL = "kwaku.ampofo@asantemills.test"

const NOW = new Date("2026-12-04T09:00:00Z")

const DAY = 24 * 60 * 60 * 1000

let projectId: string

let ca: string

let he: string

let pm: string

let client: string

let transport: FakeTransport

// Stands in for UploadThing: the file's bytes are its key.
const storage: Storages = {
  uploadthing: {
    signedLink: async (key) => `https://signed.example/${key}`,
    read: async (key) => Buffer.from(`%PDF ${key}`),
    write: async (name) => `made-${name}`,
    remove: async () => undefined,
  },
}

async function addProject(track: "Tier_1" | "Tier_3" = "Tier_1") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [
      requestId,
      track,
      rows[0]!.id,
      {
        organization_name: "Asante Mills",
        contact_person: "Kwaku Ampofo",
        email: CLIENT_EMAIL,
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

async function addRecord(toolId: string, payload: JsonObject = {}) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-18T09:00:00Z')",
    [projectId, toolId, payload]
  )
}

// A file uploaded on the project, as the CA's upload records it.
async function addFile(
  name = "IMHO_FinalContract_AsanteMills.pdf",
  type = "application/pdf"
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO files (storage, key, name, size, content_type, uploaded_by, project_id) VALUES ('uploadthing', $1, $2, 2048, $3, $4, $5) RETURNING id",
    [`key-${crypto.randomUUID()}`, name, type, ca, projectId]
  )

  return fileReference(rows[0]!.id)
}

async function reachSignature() {
  for (const toolId of ["D1.16", "D2.1", "D2.2", "D2.6", "D2.8"]) {
    await addRecord(toolId)
  }

  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })
  await addRecord("D2.5", {
    executiveDecision: "Approved for Client Transmission",
  })
  await addRecord("D2.7", { initialResponse: "Requested Negotiation" })
  await addRecord("D2.9", { meetingOutcome: "Terms Agreed - Proceed to D2.10" })
  await addRecord("D2.10")
}

async function ready(values: JsonObject = {}) {
  return saveDraft(database, ca, {
    projectId,
    toolId: "D2.11",
    cycle: 1,
    values: {
      ...(await signatureStart(database, projectId, "Gifty Ofori")),
      autoReminder: "Yes",
      finalContract: await addFile(),
      ...values,
    },
  })
}

async function send(id: string, via: Transport = transport, now = NOW) {
  return sendSignatureRequest(database, ca, id, {
    transport: via,
    now,
    storage,
  })
}

// What the form saves: the record's answers without what the system fills
// or signing writes.
const systems = new Set(
  d211.fields
    .filter((field) => field.systemFilled || field.type === "signature")
    .map((field) => field.key)
)

function form(payload: JsonObject, values: JsonObject = {}): JsonObject {
  return {
    ...Object.fromEntries(
      Object.entries(payload).filter(([key]) => !systems.has(key))
    ),
    ...values,
  }
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
  vi.stubEnv("EMAIL_FROM", "IMHOGEN <noreply@admin.imhogen.com>")
  vi.stubEnv("BETTER_AUTH_URL", "https://erm.example.com")

  transport = createFakeTransport()
  projectId = await addProject()
  ca = await addPerson("Gifty Ofori", ["CA"])
  he = await addPerson("Kwesi Appiah", ["HE"])
  pm = await addPerson("Ama Owusu", ["PM"])
  client = await addPerson("Kwaku Ampofo", ["Client"])

  await addRecord("D1.15", { budget: [{ value: 60000 }] })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await database.pool.end()
})

describe("when it opens and where it starts", () => {
  it("opens once D2.10 locks", async () => {
    await reachSignature()

    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.11")
  })

  it("starts on Digital Signature, the client contact, the HE and the sheet's script", async () => {
    expect(await signatureStart(database, projectId, "Gifty Ofori")).toEqual({
      routingMethod: DIGITAL,
      sentTo: `Kwaku Ampofo ${CLIENT_EMAIL}`,
      imhogenSignatory: "Kwesi Appiah, Head of Engineering",
      script: signatureScriptFor("Asante Mills", "Gifty Ofori", DIGITAL),
    })
    expect(
      signatureScriptFor("Asante Mills", "Gifty Ofori", DIGITAL)
    ).toContain(
      "Please find the finalized contract attached for your signature. You can click the link below to review and sign the document digitally."
    )
    expect(
      signatureScriptFor("Asante Mills", "Gifty Ofori", COURIER)
    ).not.toContain("digitally")
    expect(signatureScriptFor("Asante Mills", "Gifty Ofori", DIGITAL)).toMatch(
      /^Dear Asante Mills\n\n[\s\S]*Gifty Ofori \| IMHOGEN LTD$/
    )
  })

  it("finds the address in Sent To", () => {
    expect(addressIn(`Kwaku Ampofo ${CLIENT_EMAIL}`)).toBe(CLIENT_EMAIL)
    expect(addressIn(`Kwaku <${CLIENT_EMAIL}>`)).toBe(CLIENT_EMAIL)
    expect(addressIn("Kwaku Ampofo")).toBeUndefined()
  })
})

describe("who writes it", () => {
  beforeEach(reachSignature)

  it("lets only the CA save it; the client and the HE only sign, the PM and CR read", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])

    expect(await can(database, ca, projectId, "D2.11", "write")).toBe(true)

    for (const signer of [client, he, pm, cr]) {
      expect(await can(database, signer, projectId, "D2.11", "read")).toBe(true)
      expect(await can(database, signer, projectId, "D2.11", "write")).toBe(
        false
      )
    }

    expect(await can(database, om, projectId, "D2.11", "read")).toBe(false)

    const record = await ready()

    for (const signer of [client, he]) {
      await expect(
        updateRecord(database, signer, record.id, { actionTaken: "x" })
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
  })
})

describe("sending", () => {
  beforeEach(reachSignature)

  it("is refused without the PDF, or with a file that is not one", async () => {
    const none = await ready()

    await updateRecord(
      database,
      ca,
      none.id,
      Object.fromEntries(
        Object.entries(form(none.payload)).filter(
          ([key]) => key !== "finalContract"
        )
      )
    )

    await expect(send(none.id)).rejects.toThrow(
      "upload the final contract as a PDF"
    )

    const photo = await updateRecord(
      database,
      ca,
      none.id,
      form(none.payload, {
        finalContract: await addFile("plate.jpg", "image/jpeg"),
      })
    )

    const error = await send(photo.id).catch((caught: Error) => caught)

    expect(error).toBeInstanceOf(SendNotReadyError)
    expect(transport.sent).toEqual([])
  })

  it("emails the client once, with the PDF and the link, and fixes what was sent", async () => {
    const record = await ready()
    const sent = await send(record.id)

    expect(sent.payload.dateDispatched).toBe("2026-12-04")
    expect(sent.payload.signatureLink).toBe(
      `/projects/${projectId}/tools/D2.11`
    )
    expect(transport.sent).toHaveLength(1)

    const email = transport.sent[0]!

    expect(email.to).toBe(CLIENT_EMAIL)
    expect(email.text).toContain(
      `Review and sign it here: https://erm.example.com/projects/${projectId}/tools/D2.11`
    )
    expect(email.attachments?.[0]?.filename).toBe(
      "IMHO_FinalContract_AsanteMills.pdf"
    )
    expect(await titlesFor(client)).toContain(
      "D2.11 is waiting for your signature"
    )

    await expect(send(record.id)).rejects.toThrow("already been sent")
    expect(transport.sent).toHaveLength(1)

    await expect(
      updateRecord(
        database,
        ca,
        record.id,
        form(sent.payload, { sentTo: "someone@else.test" })
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("finishes a Send cut short, emailing the client only if they were not emailed yet", async () => {
    const record = await ready()

    // Cut short after the time was kept, before the email went.
    await database.pool.query(
      "UPDATE tool_records SET payload = payload || $2 WHERE id = $1",
      [
        record.id,
        { dateDispatched: "2026-12-04", dispatchedAt: NOW.toISOString() },
      ]
    )

    await expect(
      signField(database, client, record.id, "clientSignature")
    ).rejects.toBeInstanceOf(RecordNotEditableError)

    const retried = await send(record.id)

    expect(retried.payload.dispatchConfirmed).toBeDefined()
    expect(transport.sent).toHaveLength(1)

    // Cut short after the email went, before it was confirmed.
    await database.pool.query(
      "UPDATE tool_records SET payload = payload - 'dispatchConfirmed' WHERE id = $1",
      [record.id]
    )

    const again = await send(record.id)

    expect(again.payload.dispatchConfirmed).toBeDefined()
    expect(transport.sent).toHaveLength(1)
  })

  it("leaves the link out for Physical Courier", async () => {
    const record = await ready({ routingMethod: COURIER })
    const sent = await send(record.id)

    expect(sent.payload.signatureLink).toBeUndefined()
    expect(transport.sent[0]!.text).not.toContain("sign it here")
  })

  it("marks nothing sent when the email service refuses it", async () => {
    const record = await ready()

    const refusing: Transport = {
      name: "refusing",
      send: async () => {
        throw new Error("Mailbox unavailable")
      },
    }

    await expect(send(record.id, refusing)).rejects.toBeInstanceOf(
      EmailRefusedError
    )

    const after = await getRecord(database, ca, record.id)

    expect(after.payload.dateDispatched).toBeUndefined()
  })
})

describe("signing in the app", () => {
  beforeEach(reachSignature)

  it("waits for the send, then the client, then the HE, whose signature locks it", async () => {
    const record = await ready()

    await expect(
      signField(database, client, record.id, "clientSignature")
    ).rejects.toBeInstanceOf(RecordNotEditableError)

    await send(record.id)

    await expect(
      signField(database, he, record.id, "heSignature")
    ).rejects.toThrow("is signed after Client Signature")

    const signed = await signField(
      database,
      client,
      record.id,
      "clientSignature",
      transport
    )

    expect(signed.state).toBe("draft")
    expect(await titlesFor(he)).toContain("D2.11 is waiting for your signature")
    expect(transport.sent.map((each) => each.to)).toContain(
      "kwesi.appiah@imhogen.test"
    )

    // The CA's note keeps the client's signature.
    const noted = await updateRecord(
      database,
      ca,
      record.id,
      form(signed.payload, { actionTaken: "Called Client" })
    )

    expect(noted.payload.clientSignature).toBeDefined()

    const locked = await signField(database, he, record.id, "heSignature")

    expect(locked.state).toBe("locked")
  })

  it("keeps when each signer first opened it, once it was their turn", async () => {
    const record = await ready()

    expect(await recordViewed(database, client, record.id)).toBe(false)

    await send(record.id)

    expect(await recordViewed(database, ca, record.id)).toBe(false)
    expect(await recordViewed(database, he, record.id)).toBe(false)
    expect(
      await recordViewed(
        database,
        client,
        record.id,
        new Date(NOW.getTime() + DAY)
      )
    ).toBe(true)
    expect(await recordViewed(database, client, record.id)).toBe(false)

    await signField(database, client, record.id, "clientSignature")

    expect(
      await recordViewed(
        database,
        he,
        record.id,
        new Date(NOW.getTime() + 2 * DAY)
      )
    ).toBe(true)

    const current = await getRecord(database, ca, record.id)

    const values = await signatureValues(
      database,
      projectId,
      current.payload,
      NOW
    )

    // Signing keeps its own time, so the day is read back from it.
    const signedOn = z
      .object({ signedAt: z.string() })
      .parse(current.payload.clientSignature)
      .signedAt.slice(0, 10)

    expect(values.signatories).toEqual([
      { dateViewed: "2026-12-05", dateSigned: signedOn, status: "Signed" },
      { dateViewed: "2026-12-06", status: "Pending" },
    ])
  })

  it("refuses Submit: the signatures lock it", async () => {
    const record = await ready()

    await send(record.id)

    await expect(submitRecord(database, ca, record.id)).rejects.toThrow(
      "With Digital Signature, the client and the Head of Engineering sign it here"
    )
  })
})

describe("signed on paper", () => {
  beforeEach(reachSignature)

  it("has nothing to sign in the app, and locks once the CA records both signatures and submits", async () => {
    const record = await ready({ routingMethod: COURIER })

    await send(record.id)

    await expect(
      signField(database, client, record.id, "clientSignature")
    ).rejects.toBeInstanceOf(ValidationError)

    const current = await getRecord(database, ca, record.id)

    const pending = await updateRecord(
      database,
      ca,
      record.id,
      form(current.payload, {
        signatories: [
          {
            signatory: "[Client Name]",
            role: "Client Representative",
            dateSigned: "2026-12-10",
            status: "Signed",
          },
          {
            signatory: "[IMHOGEN Rep]",
            role: "IMHOGEN Representative",
            dateSigned: "2026-12-11",
            status: "Pending",
          },
        ],
      })
    )

    await expect(submitRecord(database, ca, pending.id)).rejects.toThrow(
      "Set both signatories to Signed once the signed copy is back"
    )

    await updateRecord(
      database,
      ca,
      record.id,
      form(pending.payload, {
        signatories: [
          {
            signatory: "[Client Name]",
            role: "Client Representative",
            dateSigned: "2026-12-10",
            status: "Signed",
          },
          {
            signatory: "[IMHOGEN Rep]",
            role: "IMHOGEN Representative",
            dateSigned: "2026-12-11",
            status: "Signed",
          },
        ],
      })
    )

    expect((await submitRecord(database, ca, record.id)).state).toBe("locked")
  })
})

describe("reminders and the 7-day flag", () => {
  beforeEach(reachSignature)

  const at = (days: number) => new Date(NOW.getTime() + days * DAY + 60_000)

  async function remind(days: number) {
    return sendSignatureReminders(database, { transport, now: at(days) })
  }

  function reminders() {
    return transport.sent.filter((each) => each.subject.startsWith("Re: "))
  }

  it("reminds the client every 3 days until they sign", async () => {
    const record = await ready()

    await send(record.id)

    expect(await remind(2)).toBe(0)
    expect(await remind(3)).toBe(1)
    expect(await remind(3)).toBe(0)
    expect(await remind(6)).toBe(1)
    expect(reminders().map((each) => each.to)).toEqual([
      CLIENT_EMAIL,
      CLIENT_EMAIL,
    ])

    await signField(database, client, record.id, "clientSignature")

    expect(await remind(9)).toBe(0)
  })

  it("never reads overdue once a courier contract is recorded as signed", async () => {
    const record = await ready({ routingMethod: COURIER })
    const sent = await send(record.id)

    const signed = {
      ...sent.payload,
      signatories: [{ status: "Signed" }, { status: "Signed" }],
    }

    expect(
      (await signatureValues(database, projectId, sent.payload, at(8))).overdue
    ).toBe("Yes")
    expect(
      (await signatureValues(database, projectId, signed, at(8))).overdue
    ).toBe("No")
  })

  it("sends no reminder when the CA chose No", async () => {
    await send((await ready({ autoReminder: "No" })).id)

    expect(await remind(3)).toBe(0)
  })

  it("at 7 days unsigned, reads Yes and tells the CA and PM once", async () => {
    const record = await ready()

    await send(record.id)

    const sent = await getRecord(database, ca, record.id)

    expect(
      (await signatureValues(database, projectId, sent.payload, at(6))).overdue
    ).toBe("No")
    expect(
      (await signatureValues(database, projectId, sent.payload, at(7))).overdue
    ).toBe("Yes")

    await remind(6)

    expect(await titlesFor(ca)).not.toContain(
      "The final contract is 7 days unsigned"
    )

    await remind(7)
    await remind(8)

    for (const person of [ca, pm]) {
      expect(
        (await titlesFor(person)).filter(
          (title) => title === "The final contract is 7 days unsigned"
        )
      ).toHaveLength(1)
    }

    expect(
      transport.sent
        .filter((each) => each.subject.includes("Contract unsigned for 7 days"))
        .map((each) => each.to)
        .sort()
    ).toEqual(["ama.owusu@imhogen.test", "gifty.ofori@imhogen.test"])
  })
})
