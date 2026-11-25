import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { ipOptions } from "@/lib/t3-contract"
import { t3ContractValues } from "@/server/contract/t3-contract"
import { listNotifications } from "@/server/notifications/notifications"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  RecordNotEditableError,
  SelfApprovalError,
  approveRecord,
  getRecord,
  saveDraft,
  sendBackRecord,
  signField,
  submitRecord,
} from "@/server/records/records"
import { getRecordScreen } from "@/server/records/screen"
import { validateRecord } from "@/server/records/validate"
import { signaturesWaitingFor } from "@/server/records/waiting-signatures"
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
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.16"] })

tools.registerTool(d21)

tools.registerTool(d22)

tools.registerTool(t3d22a)

// WB02's map names D2.3 after the draft, D2.4 after D2.3 and D2.5 after
// D2.4.
tools.registerTool(d23)

tools.registerTool(d24)

tools.registerTool(d25)

tools.registerTool(d26)

tools.registerTool(d27)

tools.registerTool(d28)

tools.registerTool(d29)

tools.registerTool(d210)

// WB02 keeps its real order: T3.D2.2a waits for D2.1.
loadUnorderedWorkflow({ wb01: ["D1.16"] })

// What the form sends for 1.0: both fixed rows, one of them picked.
function election(picked: number, fee?: number): JsonObject {
  return {
    ipElection: ipOptions.map((row, index) => ({
      picked: index === picked,
      option: row.option!,
      definition: row.definition!,
      ...(row.fee !== undefined && { fee: Number(row.fee) }),
      ...(index === picked && fee !== undefined && { fee }),
    })),
  }
}

let projectId: string

let om: string

let pm: string

let fo: string

let client: string

let le: string

async function addProject(track: "Tier_1" | "Tier_3") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Gear Housing', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [
      requestId,
      track,
      rows[0]!.id,
      { organization_name: "Kumasi Gears", contact_person: "Yaw Boateng" },
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

async function addRecord(toolId: string, onProject: string = projectId) {
  await database.pool.query(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, $2, 'locked', '{}')",
    [onProject, toolId]
  )
}

async function openTools(onProject: string = projectId) {
  return (await availableTools(database, onProject)).map((each) => each.toolId)
}

// The OM's draft with Standard Release picked, submitted.
async function submitted(values: JsonObject = election(0)) {
  const record = await saveDraft(database, om, {
    projectId,
    toolId: "T3.D2.2a",
    cycle: 1,
    values,
  })

  return (await submitRecord(database, om, record.id)).id
}

async function waitingFor(person: string) {
  return (await listNotifications(database, person, { unreadOnly: true }))
    .filter((each) => each.kind === "signature_needed")
    .map((each) => each.title)
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Tier_3")

  om = await addPerson("Efua Mensah", ["OM"])
  pm = await addPerson("Ama Owusu", ["PM"])
  fo = await addPerson("Akosua Darko", ["FO"])
  client = await addPerson("Yaw Boateng", ["Client"])
  le = await addPerson("Kofi Annan", ["LE"])

  await addRecord("D1.16")
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens on a Tier 3 project once D2.1 is locked, in place of D2.2", async () => {
    expect(await openTools()).not.toContain("T3.D2.2a")

    await addRecord("D2.1")

    const open = await openTools()

    expect(open).toContain("T3.D2.2a")
    expect(open).not.toContain("D2.2")
  })

  it("never opens on a Tier 1 project", async () => {
    const tier1 = await addProject("Tier_1")

    await addRecord("D1.16", tier1)
    await addRecord("D2.1", tier1)

    const open = await openTools(tier1)

    expect(open).toContain("D2.2")
    expect(open).not.toContain("T3.D2.2a")
  })
})

describe("the IP election", () => {
  it("needs one option picked to submit", () => {
    expect(
      validateRecord("T3.D2.2a", election(-1), { forSubmit: true })
    ).toMatchObject({
      ok: false,
      errors: [{ field: "ipElection", message: "Pick one option" }],
    })
  })

  it("refuses two options picked", () => {
    const both = election(0)

    // SAFETY: election builds an array of rows.
    for (const row of both.ipElection as JsonObject[]) {
      row.picked = true
    }

    expect(validateRecord("T3.D2.2a", both, { forSubmit: true }).ok).toBe(false)
  })

  it("needs the fee when Full IP Transfer is picked, and only then", () => {
    expect(
      validateRecord("T3.D2.2a", election(1), { forSubmit: true })
    ).toMatchObject({
      ok: false,
      errors: [
        {
          field: "ipElection",
          row: 1,
          column: "fee",
          message: "Required for the option picked",
        },
      ],
    })

    expect(
      validateRecord("T3.D2.2a", election(1, 25000), { forSubmit: true }).ok
    ).toBe(true)
    expect(
      validateRecord("T3.D2.2a", election(0), { forSubmit: true }).ok
    ).toBe(true)
  })

  it("keeps Standard Release's fee at 0", () => {
    const changed = election(0)

    // SAFETY: election builds an array of rows.
    const rows = changed.ipElection as JsonObject[]

    rows[0]!.fee = 500

    expect(
      validateRecord("T3.D2.2a", changed, { forSubmit: false })
    ).toMatchObject({
      ok: false,
      errors: [{ field: "ipElection", row: 0, column: "fee" }],
    })
  })

  it("holds only its two rows", () => {
    const added = election(0)

    // SAFETY: election builds an array of rows.
    const rows = added.ipElection as JsonObject[]

    rows.push({ picked: false })

    expect(validateRecord("T3.D2.2a", added, { forSubmit: false }).ok).toBe(
      false
    )
  })
})

describe("signing in turn", () => {
  beforeEach(async () => {
    await addRecord("D2.1")
  })

  it("goes FO, then PM, which approves it, then the client, which locks it", async () => {
    const id = await submitted()

    expect(await waitingFor(fo)).toEqual([
      "T3.D2.2a is waiting for your signature",
    ])

    await signField(database, fo, id, "foSignature")

    expect(await waitingFor(fo)).toEqual([])
    expect(await waitingFor(pm)).toHaveLength(1)

    const approved = await signField(database, pm, id, "pmSignature")

    expect(approved.state).toBe("approved")
    expect(await waitingFor(client)).toHaveLength(1)

    const locked = await signField(database, client, id, "clientSignature")

    expect(locked.state).toBe("locked")
    expect(await waitingFor(client)).toEqual([])
  })

  it("refuses a signature out of turn", async () => {
    const id = await submitted()

    await expect(signField(database, pm, id, "pmSignature")).rejects.toThrow(
      InvalidTransitionError
    )
    await expect(
      signField(database, client, id, "clientSignature")
    ).rejects.toThrow(InvalidTransitionError)

    await signField(database, fo, id, "foSignature")

    await expect(signField(database, fo, id, "foSignature")).rejects.toThrow(
      InvalidTransitionError
    )
  })

  it("refuses a signature before submit", async () => {
    const record = await saveDraft(database, om, {
      projectId,
      toolId: "T3.D2.2a",
      cycle: 1,
      values: election(0),
    })

    await expect(
      signField(database, fo, record.id, "foSignature")
    ).rejects.toThrow(RecordNotEditableError)
  })

  it("lets only each row's role sign it", async () => {
    const id = await submitted()

    await expect(signField(database, le, id, "foSignature")).rejects.toThrow(
      PermissionDeniedError
    )
  })

  it("has no Approve: the PM's signature is the approval", async () => {
    const id = await submitted()

    await signField(database, fo, id, "foSignature")

    await expect(approveRecord(database, pm, id)).rejects.toThrow(
      InvalidTransitionError
    )
  })

  it("never lets whoever submitted it approve it by signing", async () => {
    // The PM also holds the OM role here, so they may write and submit.
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, 'OM')",
      [pm, projectId]
    )

    const record = await saveDraft(database, pm, {
      projectId,
      toolId: "T3.D2.2a",
      cycle: 1,
      values: election(0),
    })

    const id = (await submitRecord(database, pm, record.id)).id

    await signField(database, fo, id, "foSignature")

    await expect(signField(database, pm, id, "pmSignature")).rejects.toThrow(
      SelfApprovalError
    )
  })

  it("lets the PM send it back before approving", async () => {
    const id = await submitted()

    await signField(database, fo, id, "foSignature")

    const back = await sendBackRecord(database, pm, id, "Use Full IP Transfer")

    expect(back.state).toBe("draft")
    expect(await waitingFor(pm)).toEqual([])
  })

  it("gives the FO and the client no way to change 1.0", async () => {
    const id = await submitted()

    for (const reader of [fo, client]) {
      await expect(
        saveDraft(database, reader, {
          projectId,
          toolId: "T3.D2.2a",
          cycle: 1,
          values: election(1, 9000),
        })
      ).rejects.toThrow(PermissionDeniedError)
    }

    expect((await getRecord(database, om, id)).payload).toMatchObject(
      election(0)
    )
  })

  it("offers each person Sign only at their turn", async () => {
    const id = await submitted()

    const sign = async (person: string) =>
      (await getRecordScreen(database, person, projectId, "T3.D2.2a")).can.sign

    expect(await sign(om)).toEqual([])
    expect(await sign(fo)).toEqual(["foSignature"])
    expect(await sign(pm)).toEqual([])
    expect(await sign(client)).toEqual([])

    await signField(database, fo, id, "foSignature")
    await signField(database, pm, id, "pmSignature")

    expect(await sign(pm)).toEqual([])
    expect(await sign(client)).toEqual(["clientSignature"])
  })

  it("puts the client's turn on their dashboard", async () => {
    const id = await submitted()

    expect(await signaturesWaitingFor(database, client)).toEqual(new Map())

    await signField(database, fo, id, "foSignature")
    await signField(database, pm, id, "pmSignature")

    expect(await signaturesWaitingFor(database, client)).toEqual(
      new Map([[projectId, ["T3.D2.2a"]]])
    )

    await signField(database, client, id, "clientSignature")

    expect(await signaturesWaitingFor(database, client)).toEqual(new Map())
  })
})

describe("the sign-off's names and dates", () => {
  it("names who is expected to sign, with no date, until they do", async () => {
    expect(await t3ContractValues(database, projectId, {})).toEqual({
      pmName: "Ama Owusu",
      pmSignedOn: "",
      foName: "Akosua Darko",
      foSignedOn: "",
      clientName: "Yaw Boateng",
      clientSignedOn: "",
    })
  })

  it("names whoever signed, and the day they did", async () => {
    expect(
      await t3ContractValues(database, projectId, {
        foSignature: { signedBy: fo, signedAt: "2026-11-20T09:30:00.000Z" },
      })
    ).toMatchObject({
      foName: "Akosua Darko",
      foSignedOn: "2026-11-20",
      pmSignedOn: "",
    })
  })
})
