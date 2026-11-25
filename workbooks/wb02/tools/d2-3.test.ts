import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  appendices,
  coreVariables,
  legalDirectives,
  paymentSchedules,
  phases,
} from "@/lib/initial-draft"
import {
  deliverableCategories,
  nextSteps,
  projectMilestones,
} from "@/lib/pm-review"
import { shownFromValues } from "@/lib/shown-from"
import { ipOptions } from "@/lib/t3-contract"
import { pmReviewStart, pmReviewValues } from "@/server/contract/pm-review"
import { getDocumentControl } from "@/server/document-control/document-control"
import { listNotifications } from "@/server/notifications/notifications"
import { previewStates } from "@/server/pdf/previews"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  getRecord,
  saveDraft,
  sentBackReason,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { systemValuesOf } from "@/server/records/system-values"
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

registerTestTools({ wb01: ["D1.15", "D1.16"] })

// WB02's map names D2.4 after D2.3, and D2.5 after D2.4.
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
]) {
  tools.registerTool(tool)
}

// WB02 keeps its real order: D2.3 waits for the draft.
loadUnorderedWorkflow({ wb01: ["D1.15", "D1.16"] })

// A complete D2.2, as the CA's form sends it.
const draft: JsonObject = {
  coreVariables: coreVariables.map((row) => ({
    variable: row.variable,
    value: "Filled",
  })),
  paymentMilestones: paymentSchedules.map((milestone) => ({
    milestone,
    schedule: "40% at signing",
  })),
  projectMilestones: phases.map((milestone) => ({
    milestone,
    timeline: "4 weeks",
  })),
  deliverables: phases.map((phase) => ({
    deliverableNumber: phase,
    deliverable: `[${phase} Key Deliverables]`,
  })),
  legalDirectives: legalDirectives.map((category) => ({ category })),
  appendices: appendices.map((row) => ({
    attachment: row.attachment,
    status: "Attached",
  })),
  initialDraftComplete: "Yes",
  readyForPmReview: "Yes",
}

// A complete review with the PM's decision.
function review(status: string): JsonObject {
  return {
    scopeVerification: deliverableCategories.map((category) => ({
      category,
      status: "Accurate",
    })),
    projectVerification: projectMilestones.map((milestone) => ({
      milestone,
      feasible: "Yes",
    })),
    clientDependencies: [
      { dependency: "Client signs off the CAD", protected: "Yes" },
    ],
    operationalStatus: status,
  }
}

let projectId: string

let ca: string

let pm: string

async function addProject(track: "Tier_1" | "Tier_3") {
  const requestId = `${track}-${Math.round(Math.random() * 1e12)}`

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', $1, $2) RETURNING id",
    [requestId, track]
  )

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ($1, $2, $3, $4)",
    [requestId, track, rows[0]!.id, { organization_name: "Asante Mills" }]
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

async function addRecord(
  toolId: string,
  payload: JsonObject = {},
  state = "locked"
) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [
      projectId,
      toolId,
      state,
      payload,
      state === "locked" ? "2026-11-20T09:00:00Z" : null,
    ]
  )

  return rows[0]!.id
}

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

// The CA drafts D2.2, signs it and submits it, which locks it.
async function lockDraft(values: JsonObject = draft) {
  const record = await saveDraft(database, ca, {
    projectId,
    toolId: "D2.2",
    cycle: 1,
    values,
  })

  await signField(database, ca, record.id, "caSignature")

  return submitRecord(database, ca, record.id)
}

// The PM fills D2.3 in, signs it and submits it, which locks it.
async function decide(status: string) {
  const record = await saveDraft(database, pm, {
    projectId,
    toolId: "D2.3",
    cycle: 1,
    values: review(status),
  })

  await signField(database, pm, record.id, "pmSignature")

  return submitRecord(database, pm, record.id)
}

// The newest record of the tool, as the PM reads it.
async function current(toolId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = $2 AND state <> 'void'",
    [projectId, toolId]
  )

  return getRecord(database, pm, rows[0]!.id)
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
}

beforeEach(async () => {
  await resetTestData(database)
  // The system reopens D2.3 once a draft it sent back is locked again.
  await restoreSystemPerson(database)

  projectId = await addProject("Tier_1")
  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.15", {
    clientDependencies:
      "Client Engineering Decision: choose as-is\n\n  Site access: weekdays  \n",
  })
  await addRecord("D1.16")
  await addRecord("D2.1")
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens on Tier 1 once D2.2 is locked, and not before", async () => {
    expect(await openTools()).not.toContain("D2.3")

    await lockDraft()

    expect(await openTools()).toContain("D2.3")
  })

  it("opens on Tier 3 once T3.D2.2a is locked", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("D1.16")
    await addRecord("D2.1")

    expect(await openTools()).not.toContain("D2.3")

    await addRecord("T3.D2.2a")

    expect(await openTools()).toContain("D2.3")
  })
})

describe("where it starts", () => {
  it("starts 2.0 and 3.0 on the sheet's rows, and 4.0 on D1.15's dependencies, one a line", async () => {
    expect(await pmReviewStart(database, projectId)).toEqual({
      scopeVerification: deliverableCategories.map((category) => ({
        category,
      })),
      projectVerification: projectMilestones.map((milestone) => ({
        milestone,
      })),
      clientDependencies: [
        { dependency: "Client Engineering Decision: choose as-is" },
        { dependency: "Site access: weekdays" },
      ],
    })
  })

  it("starts 4.0 on one empty row on Tier 3", async () => {
    projectId = await addProject("Tier_3")

    expect(
      (await pmReviewStart(database, projectId)).clientDependencies
    ).toEqual([{}])
  })

  it("shows 1.0's PM, project and client, and the day the draft locked", async () => {
    await addRecord("D2.2")

    expect(await pmReviewValues(database, projectId)).toEqual({
      projectManager: "Ama Owusu",
      projectClientName: "Rice Mill / Asante Mills",
      dateReceived: "2026-11-20",
    })
  })

  it("reads T3.D2.2a's day on Tier 3", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("T3.D2.2a")

    expect((await pmReviewValues(database, projectId)).dateReceived).toBe(
      "2026-11-20"
    )
  })

  it("shows the draft as its reference: D2.2 on Tier 1, T3.D2.2a on Tier 3", async () => {
    await addRecord("D2.2")

    expect(
      (await previewStates(database, pm, projectId, d23)).referenceDraft
    ).toMatchObject({ status: "ready", name: "D2.2 Initial Draft Contract" })

    projectId = await addProject("Tier_3")
    pm = await addPerson("Kofi Mensah", ["PM"])

    await addRecord("T3.D2.2a")

    expect(
      (await previewStates(database, pm, projectId, d23)).referenceDraft
    ).toMatchObject({
      status: "ready",
      name: "T3.D2.2a T3 Drafting Contract Mapping",
      href: `/api/projects/${projectId}/tools/T3.D2.2a/pdf`,
    })
  })
})

describe("Next Step Directive", () => {
  it("follows the status", () => {
    expect(shownFromValues(d23, {})).toEqual({ nextStepDirective: "" })
    expect(shownFromValues(d23, { operationalStatus: "Approved" })).toEqual({
      nextStepDirective: nextSteps.Approved,
    })
    expect(
      shownFromValues(d23, { operationalStatus: "Revisions Required" })
    ).toEqual({ nextStepDirective: "Return to Contract Admin for Edits" })
  })

  it("is shown with the system's values, for the page and the PDF", async () => {
    expect(
      await systemValuesOf(database, projectId, "D2.3", {
        id: "x",
        state: "draft",
        payload: { operationalStatus: "Approved" },
      })
    ).toMatchObject({
      nextStepDirective: "Proceed to Finance Review (D2.4)",
    })
  })
})

describe("the tables", () => {
  it("let the PM change a starting row and add rows, each needing its answers at submit", async () => {
    await lockDraft()

    const values = review("Approved")

    // SAFETY: review builds each table as an array of rows.
    const rows = [
      ...(values.scopeVerification as JsonObject[]),
      { category: "Spare parts", status: "Mismatch", comments: "Add 2.5" },
    ]

    rows[0] = { ...rows[0], category: "Engineering Design (CAD)" }

    const record = await saveDraft(database, pm, {
      projectId,
      toolId: "D2.3",
      cycle: 1,
      values: {
        ...values,
        scopeVerification: rows,
        // SAFETY: review builds each table as an array of rows.
        projectVerification: [
          ...(values.projectVerification as JsonObject[]),
          { milestone: "Commissioning" },
        ],
      },
    })

    await signField(database, pm, record.id, "pmSignature")

    await expect(submitRecord(database, pm, record.id)).rejects.toMatchObject({
      errors: [{ field: "projectVerification", row: 4, column: "feasible" }],
    })
  })
})

describe("deciding", () => {
  beforeEach(async () => {
    await lockDraft()
  })

  it("needs a status and the PM's signature", async () => {
    const record = await saveDraft(database, pm, {
      projectId,
      toolId: "D2.3",
      cycle: 1,
      values: Object.fromEntries(
        Object.entries(review("Approved")).filter(
          ([key]) => key !== "operationalStatus"
        )
      ),
    })

    await expect(submitRecord(database, pm, record.id)).rejects.toThrow(
      ValidationError
    )

    await updateRecord(database, pm, record.id, review("Approved"))

    await expect(submitRecord(database, pm, record.id)).rejects.toMatchObject({
      errors: [{ field: "pmSignature" }],
    })
  })

  it("locks on Approved, filling in both dates, and leaves the draft locked", async () => {
    const locked = await decide("Approved")
    const today = new Date().toISOString().slice(0, 10)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      dateReviewCompleted: today,
      signOffDate: today,
    })
    expect((await current("D2.2")).state).toBe("locked")
  })

  it("sends the draft back on Revisions Required, as a new iteration for the CA", async () => {
    const reviewed = await decide("Revisions Required")

    expect(reviewed.state).toBe("locked")

    const back = await current("D2.2")

    expect(back.state).toBe("draft")
    expect(back.payload.caSignature).toBeUndefined()
    expect(await sentBackReason(database, back)).toBe(
      "D2.3 sent it back: Revisions Required"
    )
    expect(await titlesFor(ca)).toContain("D2.2 was sent back to you")
    expect((await getDocumentControl(database, ca, back.id)).iteration).toBe(1)

    // The CA revises it and locks it again: a new iteration of D2.2, and
    // D2.3 reopens for the PM.
    await updateRecord(database, ca, back.id, {
      ...draft,
      legalDirectives: legalDirectives.map((category) => ({
        category,
        clause: "Revised",
      })),
    })
    await signField(database, ca, back.id, "caSignature")

    const relocked = await submitRecord(database, ca, back.id)

    expect(relocked.state).toBe("locked")
    expect((await getDocumentControl(database, ca, back.id)).iteration).toBe(2)

    const again = await current("D2.3")

    expect(again.id).toBe(reviewed.id)
    expect(again.state).toBe("draft")
    expect(again.payload.pmSignature).toBeUndefined()
    expect(await titlesFor(pm)).toContain("D2.3 is open again")

    // Approving the revised draft locks D2.3 as its second iteration.
    await updateRecord(database, pm, again.id, review("Approved"))
    await signField(database, pm, again.id, "pmSignature")

    const approved = await submitRecord(database, pm, again.id)

    expect(approved.state).toBe("locked")
    expect((await getDocumentControl(database, pm, again.id)).iteration).toBe(2)
    expect((await current("D2.2")).state).toBe("locked")
  })

  it("never reopens D2.3 when the draft is changed after an approval", async () => {
    await decide("Approved")

    const d22 = await current("D2.2")

    await database.pool.query(
      "UPDATE tool_records SET state = 'draft' WHERE id = $1",
      [d22.id]
    )
    await signField(database, ca, d22.id, "caSignature")
    await submitRecord(database, ca, d22.id)

    expect((await current("D2.3")).state).toBe("locked")
  })
})

describe("on Tier 3", () => {
  it("sends T3.D2.2a back to the OM, and reopens D2.3 once it is signed and locked again", async () => {
    projectId = await addProject("Tier_3")
    pm = await addPerson("Kofi Mensah", ["PM"])

    const om = await addPerson("Efua Mensah", ["OM"])
    const fo = await addPerson("Akosua Darko", ["FO"])
    const client = await addPerson("Yaw Boateng", ["Client"])

    await addRecord("D1.16")
    await addRecord("D2.1")

    const election = {
      ipElection: ipOptions.map((row, index) => ({
        picked: index === 0,
        option: row.option!,
        definition: row.definition!,
        ...(row.fee !== undefined && { fee: Number(row.fee) }),
      })),
    }

    const signed = { signedBy: om, signedAt: "2026-11-20T09:00:00.000Z" }

    const contract = await addRecord("T3.D2.2a", {
      ...election,
      foSignature: signed,
      pmSignature: signed,
      clientSignature: signed,
    })

    await database.pool.query(
      "UPDATE tool_records SET submitted_by = $1 WHERE id = $2",
      [om, contract]
    )

    await decide("Revisions Required")

    const back = await getRecord(database, om, contract)

    expect(back.state).toBe("draft")
    expect(back.payload).toEqual(election)
    expect(await titlesFor(om)).toContain("T3.D2.2a was sent back to you")

    await submitRecord(database, om, contract)
    await signField(database, fo, contract, "foSignature")
    await signField(database, pm, contract, "pmSignature")
    await signField(database, client, contract, "clientSignature")

    expect((await getRecord(database, om, contract)).state).toBe("locked")
    expect((await current("D2.3")).state).toBe("draft")
  })
})

describe("who sees it", () => {
  it("lets the PM write it, the FO, CA and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const fo = await addPerson("Esi Badu", ["FO"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, pm, projectId, "D2.3", "write")).toBe(true)

    // The FO reads it to review the draft in D2.4.
    for (const reader of [fo, ca, cr]) {
      expect(await can(database, reader, projectId, "D2.3", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.3", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.3", "read")).toBe(
        false
      )
    }

    const id = await addRecord("D2.3", review("Approved"), "draft")

    await expect(
      updateRecord(database, ca, id, review("Revisions Required"))
    ).rejects.toThrow(PermissionDeniedError)
  })
})
