import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import {
  OVERHEAD_MET,
  financialElements,
  paymentMilestones,
  riskProtections,
} from "@/lib/finance-review"
import {
  appendices,
  coreVariables,
  legalDirectives,
  paymentSchedules,
  phases,
} from "@/lib/initial-draft"
import { deliverableCategories, projectMilestones } from "@/lib/pm-review"
import { shownFromValues } from "@/lib/shown-from"
import { ipOptions } from "@/lib/t3-contract"
import {
  financeReviewFills,
  financeReviewStart,
  financeReviewValues,
} from "@/server/contract/finance-review"
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
import { systemFillsOf } from "@/server/records/fills"
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
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.14", "D1.15", "D1.16"] })

// WB02's map names D2.5 after D2.4.
for (const tool of [d21, d22, t3d22a, d23, d24, d25, d26, d27, d28]) {
  tools.registerTool(tool)
}

// WB02 keeps its real order: D2.4 waits for D2.3 locked with Approved.
loadUnorderedWorkflow({ wb01: ["D1.14", "D1.15", "D1.16"] })

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

// A complete D2.3 with the PM's decision.
function pmReview(status: string): JsonObject {
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
      { dependency: "Client signs the CAD", protected: "Yes" },
    ],
    operationalStatus: status,
  }
}

// A complete D2.4 with the FO's decision.
function review(status: string): JsonObject {
  return {
    valueVerification: financialElements.map((element, index) => ({
      element,
      ...(index === 1 && { clauseRef: `[${OVERHEAD_MET}]` }),
      status: "Accurate",
    })),
    paymentVerification: paymentMilestones.map((milestone) => ({
      milestone,
      cashFlowSafe: "Yes",
    })),
    riskVerification: riskProtections.map((protection) => ({
      protection,
      protected: "Yes",
    })),
    commercialStatus: status,
  }
}

let projectId: string

let ca: string

let pm: string

let fo: string

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
      state === "locked" ? "2026-11-21T09:00:00Z" : null,
    ]
  )

  return rows[0]!.id
}

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

// The newest record of the tool, as the PM reads it.
async function current(toolId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = $2 AND state <> 'void'",
    [projectId, toolId]
  )

  return getRecord(database, pm, rows[0]!.id)
}

// The CA drafts D2.2, signs it and submits it, which locks it.
async function lockDraft() {
  const record = await saveDraft(database, ca, {
    projectId,
    toolId: "D2.2",
    cycle: 1,
    values: draft,
  })

  await signField(database, ca, record.id, "caSignature")

  return submitRecord(database, ca, record.id)
}

// The PM approves the draft in D2.3, which opens D2.4.
async function pmApproves() {
  const record = await saveDraft(database, pm, {
    projectId,
    toolId: "D2.3",
    cycle: 1,
    values: pmReview("Approved"),
  })

  await signField(database, pm, record.id, "pmSignature")

  return submitRecord(database, pm, record.id)
}

// The FO fills D2.4 in, signs it and submits it, which locks it.
async function decide(status: string) {
  const record = await saveDraft(database, fo, {
    projectId,
    toolId: "D2.4",
    cycle: 1,
    values: review(status),
  })

  await signField(database, fo, record.id, "foSignature")

  return submitRecord(database, fo, record.id)
}

async function titlesFor(person: string) {
  return (await listNotifications(database, person)).map((each) => each.title)
}

beforeEach(async () => {
  await resetTestData(database)
  // The system reopens the reviews once a draft they sent back is locked.
  await restoreSystemPerson(database)

  projectId = await addProject("Tier_1")
  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])
  fo = await addPerson("Esi Badu", ["FO"])

  await addRecord("D1.14", { minimumOverheadMet: true })
  await addRecord("D1.15")
  await addRecord("D1.16")
  await addRecord("D2.1")
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens once D2.3 is locked with Approved, and not with Revisions Required", async () => {
    await addRecord("D2.2")

    expect(await openTools()).not.toContain("D2.4")

    const sent = await addRecord("D2.3", pmReview("Revisions Required"))

    expect(await openTools()).not.toContain("D2.4")

    await database.pool.query(
      "UPDATE tool_records SET payload = $1 WHERE id = $2",
      [pmReview("Approved"), sent]
    )

    expect(await openTools()).toContain("D2.4")
  })

  it("opens on Tier 3 after T3.D2.2a and D2.3", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("D1.16")
    await addRecord("D2.1")
    await addRecord("T3.D2.2a")

    expect(await openTools()).not.toContain("D2.4")

    await addRecord("D2.3", pmReview("Approved"))

    expect(await openTools()).toContain("D2.4")
  })
})

describe("where it starts", () => {
  it("starts 2.0 to 4.0 on the sheet's rows", () => {
    expect(financeReviewStart()).toEqual({
      valueVerification: financialElements.map((element) => ({ element })),
      paymentVerification: paymentMilestones.map((milestone) => ({
        milestone,
      })),
      riskVerification: riskProtections.map((protection) => ({ protection })),
    })
  })

  it("shows 1.0's FO, project and client, and the day D2.3 locked", async () => {
    await addRecord("D2.3", pmReview("Approved"))

    expect(await financeReviewValues(database, projectId)).toEqual({
      financeOfficer: "Esi Badu",
      projectClientName: "Rice Mill / Asante Mills",
      dateReceived: "2026-11-21",
    })
  })

  it("shows the FO the draft and the PM's review", async () => {
    await addRecord("D2.2")
    await addRecord("D2.3", pmReview("Approved"))

    const states = await previewStates(database, fo, projectId, d24)

    expect(states.referenceDraft).toMatchObject({
      status: "ready",
      name: "D2.2 Initial Draft Contract",
    })
    expect(states.pmReview).toMatchObject({
      status: "ready",
      name: "D2.3 PM Review Draft",
      href: `/api/projects/${projectId}/tools/D2.3/pdf`,
    })
  })

  it("shows T3.D2.2a as the draft on Tier 3", async () => {
    projectId = await addProject("Tier_3")
    fo = await addPerson("Akosua Darko", ["FO"])

    await addRecord("T3.D2.2a")

    expect(
      (await previewStates(database, fo, projectId, d24)).referenceDraft
    ).toMatchObject({
      status: "ready",
      name: "T3.D2.2a T3 Drafting Contract Mapping",
    })
  })
})

describe("row 2.2", () => {
  it("is D1.14's answer to whether the minimum overhead is met, read only", async () => {
    expect(
      d24.fields.find((field) => field.key === "valueVerification")
    ).toMatchObject({
      fixedRows: [{}, { clauseRef: `[${OVERHEAD_MET}]` }, {}],
    })

    expect(await systemFillsOf(database, projectId, "D2.4")).toEqual({
      [OVERHEAD_MET]: "Yes",
    })

    await database.pool.query(
      "UPDATE tool_records SET payload = $1 WHERE project_id = $2 AND tool_id = 'D1.14'",
      [{ minimumOverheadMet: false }, projectId]
    )

    expect(await financeReviewFills(database, projectId)).toEqual({
      [OVERHEAD_MET]: "No",
    })
  })

  it("cannot be typed in", async () => {
    await lockDraft()
    await pmApproves()

    const values = review("Approved")

    // SAFETY: review builds each table as an array of rows.
    const rows = values.valueVerification as JsonObject[]

    await expect(
      saveDraft(database, fo, {
        projectId,
        toolId: "D2.4",
        cycle: 1,
        values: {
          ...values,
          valueVerification: rows.map((row, index) =>
            index === 1 ? { ...row, clauseRef: "Section 3.9" } : row
          ),
        },
      })
    ).rejects.toThrow(ValidationError)
  })
})

describe("Next Step Directive", () => {
  it("follows the status", () => {
    expect(shownFromValues(d24, {})).toEqual({ nextStepDirective: "" })
    expect(shownFromValues(d24, { commercialStatus: "Approved" })).toEqual({
      nextStepDirective: "Proceed to Executive Review (D2.5)",
    })
    expect(
      shownFromValues(d24, { commercialStatus: "Revisions Required" })
    ).toEqual({ nextStepDirective: "Return to Contract Admin for Edits" })
  })
})

describe("the tables", () => {
  it("keep their starting rows, whose text the FO can change, and take added rows", async () => {
    await lockDraft()
    await pmApproves()

    const values = review("Approved")

    // SAFETY: review builds each table as an array of rows.
    const rows = [...(values.riskVerification as JsonObject[])]

    rows[0] = { ...rows[0], protection: "Quote Validity Period (30 days)" }

    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D2.4",
      cycle: 1,
      values: {
        ...values,
        riskVerification: [...rows, { protection: "Retention" }],
      },
    })

    await signField(database, fo, record.id, "foSignature")

    await expect(submitRecord(database, fo, record.id)).rejects.toMatchObject({
      errors: [{ field: "riskVerification", row: 3, column: "protected" }],
    })

    await expect(
      updateRecord(database, fo, record.id, {
        ...values,
        riskVerification: rows.slice(1),
      })
    ).rejects.toThrow(ValidationError)
  })
})

describe("deciding", () => {
  beforeEach(async () => {
    await lockDraft()
    await pmApproves()
  })

  it("needs a status and the FO's signature", async () => {
    const record = await saveDraft(database, fo, {
      projectId,
      toolId: "D2.4",
      cycle: 1,
      values: Object.fromEntries(
        Object.entries(review("Approved")).filter(
          ([key]) => key !== "commercialStatus"
        )
      ),
    })

    await expect(submitRecord(database, fo, record.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "commercialStatus" }),
      ]),
    })

    await updateRecord(database, fo, record.id, review("Approved"))

    await expect(submitRecord(database, fo, record.id)).rejects.toMatchObject({
      errors: [{ field: "foSignature" }],
    })
  })

  it("locks on Approved, filling in both dates, and leaves the draft and D2.3 locked", async () => {
    const locked = await decide("Approved")
    const today = locked.lockedAt?.toISOString().slice(0, 10)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      dateReviewCompleted: today,
      signOffDate: today,
    })
    expect((await current("D2.2")).state).toBe("locked")
    expect((await current("D2.3")).state).toBe("locked")
  })

  it("sends the draft back on Revisions Required, then runs D2.3 and D2.4 again in turn", async () => {
    const reviewed = await decide("Revisions Required")

    expect(reviewed.state).toBe("locked")

    const back = await current("D2.2")

    expect(back.state).toBe("draft")
    expect(await sentBackReason(database, back)).toBe(
      "D2.4 sent it back: Revisions Required"
    )
    expect(await titlesFor(ca)).toContain("D2.2 was sent back to you")
    expect((await current("D2.3")).state).toBe("locked")

    // The CA revises the draft and locks it again: D2.3 reopens for the PM,
    // and D2.4 waits for it.
    await updateRecord(database, ca, back.id, draft)
    await signField(database, ca, back.id, "caSignature")
    await submitRecord(database, ca, back.id)

    expect((await getDocumentControl(database, ca, back.id)).iteration).toBe(2)

    const pmAgain = await current("D2.3")

    expect(pmAgain.state).toBe("draft")
    expect(pmAgain.payload.pmSignature).toBeUndefined()
    expect(await sentBackReason(database, pmAgain)).toBe(
      "D2.2 was revised after D2.4 sent it back: review it again"
    )
    expect(await titlesFor(pm)).toContain("D2.3 is open again")
    expect((await current("D2.4")).state).toBe("locked")

    // The PM approves the revised draft: D2.4 reopens for the FO.
    await signField(database, pm, pmAgain.id, "pmSignature")
    await submitRecord(database, pm, pmAgain.id)

    const foAgain = await current("D2.4")

    expect(foAgain.id).toBe(reviewed.id)
    expect(foAgain.state).toBe("draft")
    expect(foAgain.payload.foSignature).toBeUndefined()
    expect(await titlesFor(fo)).toContain("D2.4 is open again")

    await updateRecord(database, fo, foAgain.id, review("Approved"))
    await signField(database, fo, foAgain.id, "foSignature")

    const approved = await submitRecord(database, fo, foAgain.id)

    expect(approved.state).toBe("locked")
    expect((await getDocumentControl(database, fo, foAgain.id)).iteration).toBe(
      2
    )
  })

  it("keeps D2.4 locked when the PM sends the revised draft back again", async () => {
    await decide("Revisions Required")

    const back = await current("D2.2")

    await signField(database, ca, back.id, "caSignature")
    await submitRecord(database, ca, back.id)

    const pmAgain = await current("D2.3")

    await updateRecord(database, pm, pmAgain.id, pmReview("Revisions Required"))
    await signField(database, pm, pmAgain.id, "pmSignature")
    await submitRecord(database, pm, pmAgain.id)

    expect((await current("D2.2")).state).toBe("draft")
    expect((await current("D2.4")).state).toBe("locked")
  })
})

describe("on Tier 3", () => {
  it("sends T3.D2.2a back to the OM, then reopens D2.3 once it is signed and locked again", async () => {
    projectId = await addProject("Tier_3")
    pm = await addPerson("Kofi Mensah", ["PM"])
    fo = await addPerson("Akosua Darko", ["FO"])

    const om = await addPerson("Efua Mensah", ["OM"])
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

    await addRecord("D2.3", pmReview("Approved"))
    await decide("Revisions Required")

    expect((await getRecord(database, om, contract)).state).toBe("draft")
    expect(await titlesFor(om)).toContain("T3.D2.2a was sent back to you")

    await submitRecord(database, om, contract)
    await signField(database, fo, contract, "foSignature")
    await signField(database, pm, contract, "pmSignature")
    await signField(database, client, contract, "clientSignature")

    expect((await getRecord(database, om, contract)).state).toBe("locked")
    expect((await current("D2.3")).state).toBe("draft")
    expect((await current("D2.4")).state).toBe("locked")
  })
})

describe("who sees it", () => {
  it("lets the FO write it, the PM, CA and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, fo, projectId, "D2.4", "write")).toBe(true)

    for (const reader of [pm, ca, cr]) {
      expect(await can(database, reader, projectId, "D2.4", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.4", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.4", "read")).toBe(
        false
      )
    }

    const id = await addRecord("D2.4", review("Approved"), "draft")

    await expect(
      updateRecord(database, pm, id, review("Revisions Required"))
    ).rejects.toThrow(PermissionDeniedError)
  })
})
