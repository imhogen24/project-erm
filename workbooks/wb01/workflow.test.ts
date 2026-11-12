import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { roles, type JsonObject, type ServiceTrack } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  ToolNotAvailableError,
  createRecord,
  lockSentDraft,
  signField,
  transitionRecord,
  updateRecord,
  type RecordState,
} from "@/server/records/records"
import { signatureFields } from "@/server/records/signatures"
import { tools } from "@/server/tools/registry"
import { registerTestTools } from "@/server/tools/testing"
import {
  availableTools,
  loadWorkflow,
  toolStatus,
  workflowMaps,
} from "@/server/workflow/workflow"

import { registerAllTools } from "../index"
import { qualityGateQuestions } from "./tools/t3-d1-3a"

// The real WB01 map and tools. D2.1 stands in for the first tool of WB02,
// which has no definition yet.
const database = createTestDatabase()

registerAllTools(tools)

registerTestTools({ wb02: ["D2.1"] })

loadWorkflow(workflowMaps)

// D1.2 with its three checks answered. A spam request may fail a check.
function triage(decision: string, status: string) {
  return {
    triageChecklist: [
      "Is the notification readable and free of malicious links?",
      "Does the request broadly align with IMHOGEN's services?",
      "Is the contact information apparently valid and legible?",
    ].map((check) => ({ check, status, reviewerNotes: "Checked" })),
    triageDecision: decision,
  }
}

const spam = triage("Reject as Spam", "Fail")

// The answers that keep the route going.
const answers = new Map<string, JsonObject>([
  ["D1.1", { attachedFiles: [] }],
  ["D1.2", triage("Proceed to D1.3", "Pass")],
  [
    "T3.D1.8a",
    {
      equipment: [{ tool: "Tape Measure" }],
      dimensions: [
        {
          feature: "Outline",
          method: "Tape Measure",
          value: "4200 x 1800",
          confidence: "Medium",
        },
      ],
      photos: [{ view: "All views", captured: "Yes" }],
    },
  ],
  [
    "D1.7",
    {
      actualDate: "2026-11-17",
      actualStartTime: "14:00",
      actualEndTime: "14:35",
      imhogenPresent: [{ name: "Kwabena Asante", present: true }],
      clientPresent: [{ name: "Kwaku Ampofo", present: true }],
      discussion: [{ topic: "Introductions", rawNotes: "Agenda agreed." }],
      primaryOutcome: "A site visit date will be set.",
      clientNextStep: "Confirm the date.",
      imhogenNextStep: "Propose a date.",
    },
  ],
  [
    "T3.D1.3a",
    {
      sourceAssets: [{ assetType: "Paper drawing" }],
      draftingSpecs: [
        { requirement: "3D Modelling", toleranceClass: "General" },
      ],
      qualityGate: qualityGateQuestions.map((question) => ({
        question,
        answer: "Yes",
      })),
    },
  ],
  // In the app the PM's Send locks D1.4; here it moves like any record.
  ["D1.4", { subject: "Acknowledgement of Boiler request", body: "Dear Ama," }],
  ["D1.10", { overallCapabilityStatus: "Capable" }],
  ["D1.11", { goNoGoDecision: "Go" }],
  ["D1.14", { minimumOverheadMet: true }],
])

const tier1 = [
  "D1.1",
  "D1.2",
  "D1.3",
  "D1.4",
  "D1.5",
  "D1.6",
  "D1.7",
  "D1.8",
  "D1.9",
  "D1.10",
  "D1.11",
  "D1.12",
  "D1.13",
  "D1.14",
  "D1.15",
  "D1.16",
]

const tier3 = [
  "D1.1",
  "D1.2",
  "T3.D1.3a",
  "D1.4",
  "T3.D1.8a",
  "D1.9",
  "D1.10",
  "D1.11",
  "D1.12",
  "D1.13",
  "D1.14",
  "T3.D1.15a",
  "D1.16",
]

let projectId: string

// Holds every role, so permissions never get in the way of the route.
let actor: string

async function addProject(track: ServiceTrack) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Boiler', $1, $2) RETURNING id",
    [`T-${crypto.randomUUID()}`, track]
  )

  return rows[0]!.id
}

async function useProject(track: ServiceTrack) {
  projectId = await addProject(track)

  for (const role of roles) {
    await database.pool.query(
      "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
      [actor, projectId, role]
    )
  }
}

async function recordIn(
  state: RecordState,
  toolId: string,
  payload = answers.get(toolId) ?? {}
) {
  const record = await createRecord(database, actor, {
    projectId,
    toolId,
    payload,
  })

  // D1.1 is the client's web form: it has no approver and locks the moment
  // it is sent. D1.5 and D1.6 have none either: the OM's own step locks each.
  if (["D1.1", "D1.5", "D1.6"].includes(toolId) && state !== "draft") {
    return lockSentDraft(database, actor, record.id, {})
  }

  const order: RecordState[] = ["draft", "submitted", "approved", "locked"]

  // Approving needs every signature signed, so a record that goes past draft
  // is signed first.
  if (state !== "draft") {
    for (const field of signatureFields(toolId)) {
      await signField(database, actor, record.id, field.key)
    }
  }

  for (const step of order.slice(1, order.indexOf(state) + 1)) {
    await transitionRecord(database, actor, record.id, step)
  }

  // Only the delivery check fills in D1.4's status. On the route the email
  // was delivered.
  if (toolId === "D1.4" && state === "locked") {
    await setDelivery(record.id, "Delivered")
  }

  return record
}

// What the delivery check (server/acknowledgement/delivery) writes.
async function setDelivery(recordId: string, status: string) {
  await database.pool.query(
    `UPDATE tool_records SET payload = payload || jsonb_build_object('deliveryStatus', $2::text) WHERE id = $1`,
    [recordId, status]
  )
}

// Locks every tool of the route up to and including `last`.
async function lockThrough(last: string, route = tier1) {
  for (const toolId of route.slice(0, route.indexOf(last) + 1)) {
    await recordIn("locked", toolId)
  }
}

async function open() {
  return (await availableTools(database, projectId)).map((tool) => tool.toolId)
}

async function status() {
  const { rows } = await database.pool.query<{ status: string }>(
    "SELECT status FROM projects WHERE id = $1",
    [projectId]
  )

  return rows[0]!.status
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ('Ama', 'ama@example.com') RETURNING id"
  )

  actor = rows[0]!.id

  await useProject("Tier_1")
})

afterAll(async () => {
  await database.pool.end()
})

describe("the Tier 1 route", () => {
  it("opens only D1.1 on a new project", async () => {
    expect(await availableTools(database, projectId)).toEqual([
      { toolId: "D1.1", cycle: 1 },
    ])
  })

  it("opens exactly the next tool after each lock, then WB02", async () => {
    for (const [index, toolId] of tier1.entries()) {
      expect(await open()).toEqual([toolId])

      await recordIn("locked", toolId)

      expect(await open()).toEqual([tier1[index + 1] ?? "D2.1"])
    }
  })

  it("keeps D1.9 closed while D1.8 is only approved, and names D1.8", async () => {
    await lockThrough("D1.7")
    await recordIn("approved", "D1.8")

    expect(await open()).not.toContain("D1.9")
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.9" })
    ).rejects.toThrow(ToolNotAvailableError)
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.9" })
    ).rejects.toThrow(/D1\.8 is not locked/)
  })

  it("opens D1.9 once D1.8 is locked", async () => {
    await lockThrough("D1.8")

    expect(await open()).toEqual(["D1.9"])
  })

  it("opens D1.3 when D1.2 is locked with Proceed", async () => {
    await lockThrough("D1.2")

    expect(await open()).toEqual(["D1.3"])
  })

  it("does not open D1.3 while the Proceed answer is only a draft", async () => {
    await lockThrough("D1.1")
    await recordIn("draft", "D1.2")

    expect(await open()).toEqual([])
  })

  it("refuses a second record of a tool that does not repeat", async () => {
    await lockThrough("D1.2")
    await recordIn("draft", "D1.3")

    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.3" })
    ).rejects.toThrow(/D1\.3 already has a record/)
  })

  it("keeps D1.15 closed while the minimum overhead is not met, without stopping", async () => {
    await lockThrough("D1.13")
    await recordIn("locked", "D1.14", { minimumOverheadMet: false })

    expect(await open()).toEqual([])
    expect(await status()).toBe("active")
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.15" })
    ).rejects.toThrow(/D1\.14 is not locked with minimumOverheadMet true/)
  })
})

describe("hard stops", () => {
  it("rejects the project and never opens D1.3 when the PM approves D1.2 as spam", async () => {
    await lockThrough("D1.1")
    await recordIn("locked", "D1.2", spam)

    expect(await open()).toEqual([])
    expect(await status()).toBe("rejected")
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.3" })
    ).rejects.toThrow()
  })

  it("logs the status change with the answer as its reason", async () => {
    await lockThrough("D1.1")
    await recordIn("locked", "D1.2", spam)

    const { rows } = await database.pool.query(
      `SELECT record_id AS "recordId", actor_id AS "actorId", field,
       old_value AS "oldValue", new_value AS "newValue", reason
       FROM audit_log WHERE field = 'status'`
    )

    expect(rows).toEqual([
      {
        recordId: null,
        actorId: actor,
        field: "status",
        oldValue: "active",
        newValue: "rejected",
        reason: 'D1.2 was locked with triageDecision "Reject as Spam"',
      },
    ])
  })

  it("closes the project and keeps D1.12 closed when D1.11 is No-Go", async () => {
    await lockThrough("D1.10")
    await recordIn("locked", "D1.11", { goNoGoDecision: "No-Go" })

    expect(await open()).toEqual([])
    expect(await status()).toBe("closed")
  })

  it("rejects the project when D1.10 is Not Capable", async () => {
    await lockThrough("D1.9")
    await recordIn("locked", "D1.10", {
      overallCapabilityStatus: "Not Capable",
    })

    expect(await open()).toEqual([])
    expect(await status()).toBe("rejected")
  })

  it("voids no record", async () => {
    await lockThrough("D1.10")
    await recordIn("locked", "D1.11", { goNoGoDecision: "No-Go" })

    const { rows } = await database.pool.query(
      "SELECT 1 FROM tool_records WHERE state <> 'locked'"
    )

    expect(rows).toHaveLength(0)
  })

  it("does not stop on a draft spam answer, which can still change", async () => {
    await lockThrough("D1.1")

    const draft = await recordIn("draft", "D1.2", spam)

    expect(await status()).toBe("active")

    await updateRecord(database, actor, draft.id, answers.get("D1.2")!)

    for (const step of ["submitted", "approved", "locked"] as const) {
      await transitionRecord(database, actor, draft.id, step)
    }

    expect(await open()).toEqual(["D1.3"])
    expect(await status()).toBe("active")
  })
})

describe("the Tier 3 route", () => {
  beforeEach(async () => {
    await useProject("Tier_3")
  })

  it("opens only D1.1 on a new project", async () => {
    expect(await open()).toEqual(["D1.1"])
  })

  it("opens T3.D1.3a and not D1.3 after Proceed", async () => {
    await lockThrough("D1.2", tier3)

    expect(await open()).toEqual(["T3.D1.3a"])
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.3" })
    ).rejects.toThrow(/Tier_3 projects do not use D1\.3/)
  })

  it("goes from D1.4 to T3.D1.8a and never opens D1.5 to D1.7", async () => {
    for (const [index, toolId] of tier3.entries()) {
      await recordIn("locked", toolId)

      const now = await open()

      expect(now).toEqual([tier3[index + 1] ?? "D2.1"])
    }

    for (const skipped of ["D1.5", "D1.6", "D1.7"]) {
      await expect(
        createRecord(database, actor, { projectId, toolId: skipped })
      ).rejects.toThrow(ToolNotAvailableError)
    }
  })

  it("stops the same way as Tier 1", async () => {
    await lockThrough("D1.1", tier3)
    await recordIn("locked", "D1.2", spam)

    expect(await open()).toEqual([])
    expect(await status()).toBe("rejected")
  })
})

// D1.5 proposes meeting times to the client, so it waits for the
// acknowledgement email to arrive, not just to be sent (RDP-151).
describe("D1.4 delivery", () => {
  const waitNote = "This tool opens after D1.4 is delivered."

  // Locks the route up to D1.4 on Tier 3, with the email at `status`.
  async function lockedTier3D14(status: string) {
    await lockThrough("T3.D1.3a", tier3)

    const record = await recordIn("locked", "D1.4")

    await setDelivery(record.id, status)

    return record
  }

  it("keeps D1.5 closed while D1.4 is locked and only Sent, and says why", async () => {
    await lockThrough("D1.3")

    const record = await recordIn("locked", "D1.4")

    await setDelivery(record.id, "Sent")

    expect(await open()).toEqual([])
    expect((await toolStatus(database, projectId, "D1.5")).note).toBe(waitNote)
    await expect(
      createRecord(database, actor, { projectId, toolId: "D1.5" })
    ).rejects.toThrow(ToolNotAvailableError)
  })

  it("keeps D1.5 closed after a bounce", async () => {
    await lockThrough("D1.3")

    const record = await recordIn("locked", "D1.4")

    await setDelivery(record.id, "Bounced")

    expect(await open()).toEqual([])
    expect((await toolStatus(database, projectId, "D1.5")).note).toBe(waitNote)
  })

  it("opens D1.5 once the email is Delivered", async () => {
    await lockThrough("D1.3")

    const record = await recordIn("locked", "D1.4")

    await setDelivery(record.id, "Sent")
    await setDelivery(record.id, "Delivered")

    expect(await open()).toEqual(["D1.5"])
    expect((await toolStatus(database, projectId, "D1.5")).note).toBeNull()
  })

  it("says nothing about delivery while D1.4 is not locked yet", async () => {
    await lockThrough("D1.3")
    await recordIn("draft", "D1.4")

    expect((await toolStatus(database, projectId, "D1.5")).note).toBeNull()
  })

  describe("on Tier 3", () => {
    beforeEach(async () => {
      await useProject("Tier_3")
    })

    it("keeps T3.D1.8a closed while D1.4 is only Sent", async () => {
      await lockedTier3D14("Sent")

      expect(await open()).toEqual([])
      expect((await toolStatus(database, projectId, "T3.D1.8a")).note).toBe(
        waitNote
      )
    })

    it("opens T3.D1.8a once Delivered, and never offers D1.5 to D1.7", async () => {
      await lockedTier3D14("Delivered")

      expect(await open()).toEqual(["T3.D1.8a"])

      for (const skipped of ["D1.5", "D1.6", "D1.7"]) {
        await expect(
          createRecord(database, actor, { projectId, toolId: skipped })
        ).rejects.toThrow(ToolNotAvailableError)
      }
    })
  })
})

describe("opening WB02", () => {
  it("opens its first tool once D1.16 is locked", async () => {
    await lockThrough("D1.16")

    expect(await open()).toEqual(["D2.1"])
  })

  it("keeps it closed while D1.15 is locked and D1.16 is not", async () => {
    await lockThrough("D1.15")
    await recordIn("approved", "D1.16")

    expect(await open()).toEqual([])
    await expect(
      createRecord(database, actor, { projectId, toolId: "D2.1" })
    ).rejects.toThrow(/D1\.16 is not locked/)
  })
})
