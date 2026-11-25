import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import { macroRisks, signOffCheckpoints } from "@/lib/executive-review"
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
  executiveReviewStart,
  executiveReviewValues,
} from "@/server/contract/executive-review"
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
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"] })

for (const tool of [d21, d22, t3d22a, d23, d24, d25, d26]) {
  tools.registerTool(tool)
}

// WB02 keeps its real order: D2.5 waits for D2.4 locked with Approved.
loadUnorderedWorkflow({ wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"] })

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
function financeReview(status: string): JsonObject {
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

// A complete D2.5 with the executive's decision.
function review(decision: string): JsonObject {
  return {
    signOffVerification: signOffCheckpoints.map((checkpoint) => ({
      checkpoint,
      status: "Verified",
    })),
    riskAssessment: macroRisks.map((risk) => ({ ...risk, status: "Yes" })),
    strategicAlignment: "Yes",
    executiveDecision: decision,
  }
}

let projectId: string

let ca: string

let pm: string

let fo: string

let he: string

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

async function projectStatus() {
  const { rows } = await database.pool.query<{ status: string }>(
    "SELECT status FROM projects WHERE id = $1",
    [projectId]
  )

  return rows[0]!.status
}

// The newest record of the tool, as the PM reads it.
async function current(toolId: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "SELECT id FROM tool_records WHERE project_id = $1 AND tool_id = $2 AND state <> 'void'",
    [projectId, toolId]
  )

  return getRecord(database, pm, rows[0]!.id)
}

// A reviewer fills their review in, signs it and submits it, which locks it.
async function lockReview(
  person: string,
  toolId: string,
  values: JsonObject,
  signature: string
) {
  const record = await saveDraft(database, person, {
    projectId,
    toolId,
    cycle: 1,
    values,
  })

  await signField(database, person, record.id, signature)

  return submitRecord(database, person, record.id)
}

// A reopened record, answered, signed and submitted again.
async function relock(
  person: string,
  id: string,
  values: JsonObject,
  signature: string
) {
  await updateRecord(database, person, id, values)
  await signField(database, person, id, signature)

  return submitRecord(database, person, id)
}

// The CA's draft, the PM's review and the FO's review, each locked with
// Approved, which opens D2.5.
async function approveThroughFinance() {
  await lockReview(ca, "D2.2", draft, "caSignature")
  await lockReview(pm, "D2.3", pmReview("Approved"), "pmSignature")
  await lockReview(fo, "D2.4", financeReview("Approved"), "foSignature")
}

async function decide(decision: string) {
  return lockReview(he, "D2.5", review(decision), "heSignature")
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
  he = await addPerson("Kwesi Appiah", ["HE"])

  await addRecord("D1.14", { minimumOverheadMet: true })
  await addRecord("D1.15", {
    budget: [
      { value: 60000, paymentSchedule: "40% at signing" },
      { value: 34400, paymentSchedule: "60% at handover" },
    ],
  })
  await addRecord("D1.16")
  await addRecord("D2.1")
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens once D2.4 is locked with Approved, and not with Revisions Required", async () => {
    await addRecord("D2.2")
    await addRecord("D2.3", pmReview("Approved"))

    expect(await openTools()).not.toContain("D2.5")

    const finance = await addRecord("D2.4", financeReview("Revisions Required"))

    expect(await openTools()).not.toContain("D2.5")

    await database.pool.query(
      "UPDATE tool_records SET payload = $1 WHERE id = $2",
      [financeReview("Approved"), finance]
    )

    expect(await openTools()).toContain("D2.5")
  })

  it("opens on Tier 3 after T3.D2.2a, D2.3 and D2.4", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("D1.16")
    await addRecord("D2.1")
    await addRecord("T3.D2.2a")
    await addRecord("D2.3", pmReview("Approved"))

    expect(await openTools()).not.toContain("D2.5")

    await addRecord("D2.4", financeReview("Approved"))

    expect(await openTools()).toContain("D2.5")
  })
})

describe("where it starts", () => {
  it("starts 2.0 and 3.0 on the sheet's rows", () => {
    expect(executiveReviewStart()).toEqual({
      signOffVerification: signOffCheckpoints.map((checkpoint) => ({
        checkpoint,
      })),
      riskAssessment: macroRisks.map((risk) => ({
        category: risk.category,
        question: risk.question,
      })),
    })
  })

  it("shows 1.0's executive, the day D2.4 locked, the project and client, and D1.15's total", async () => {
    await addRecord("D2.4", financeReview("Approved"))

    expect(await executiveReviewValues(database, projectId)).toEqual({
      executive: "Kwesi Appiah",
      dateReceived: "2026-11-21",
      projectClientName: "Rice Mill / Asante Mills",
      projectValue: "GHS 94,400.00",
    })
  })

  it("shows T3.D1.15a's total on Tier 3", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("T3.D1.15a", { totalT3ProjectValue: 12500 })

    expect(
      (await executiveReviewValues(database, projectId)).projectValue
    ).toBe("GHS 12,500.00")
  })

  it("shows the executive the draft and the Finance review", async () => {
    await addRecord("D2.2")
    await addRecord("D2.3", pmReview("Approved"))
    await addRecord("D2.4", financeReview("Approved"))

    const states = await previewStates(database, he, projectId, d25)

    expect(states.referenceDraft).toMatchObject({
      status: "ready",
      name: "D2.2 Initial Draft Contract",
    })
    expect(states.financeReview).toMatchObject({
      status: "ready",
      name: "D2.4 Finance Review Draft",
      href: `/api/projects/${projectId}/tools/D2.4/pdf`,
    })
  })

  it("shows T3.D2.2a as the draft on Tier 3", async () => {
    projectId = await addProject("Tier_3")
    he = await addPerson("Kwame Asante", ["HE"])

    await addRecord("T3.D2.2a")

    expect(
      (await previewStates(database, he, projectId, d25)).referenceDraft
    ).toMatchObject({
      status: "ready",
      name: "T3.D2.2a T3 Drafting Contract Mapping",
    })
  })
})

describe("Next Step Directive", () => {
  it("follows the decision", () => {
    expect(shownFromValues(d25, {})).toEqual({ nextStepDirective: "" })
    expect(
      shownFromValues(d25, {
        executiveDecision: "Approved for Client Transmission",
      })
    ).toEqual({
      nextStepDirective:
        "Proceed to D2.6 (Lock Draft) and D2.7 (Client Transmittal)",
    })
    expect(shownFromValues(d25, { executiveDecision: "Rejected" })).toEqual({
      nextStepDirective: "Project Closed",
    })
    expect(
      shownFromValues(d25, { executiveDecision: "Hold for Revision" })
    ).toEqual({ nextStepDirective: "Return to Contract Admin for Edits" })
  })
})

describe("the tables", () => {
  it("keep their starting rows, whose text the executive can change, and take added rows", async () => {
    await approveThroughFinance()

    const values = review("Approved for Client Transmission")

    // SAFETY: review builds each table as an array of rows.
    const rows = [...(values.riskAssessment as JsonObject[])]

    rows[1] = { ...rows[1], question: "Is there a two-week supply buffer?" }

    const record = await saveDraft(database, he, {
      projectId,
      toolId: "D2.5",
      cycle: 1,
      values: {
        ...values,
        riskAssessment: [...rows, { category: "Reputational Risk" }],
      },
    })

    expect(record.payload.riskAssessment).toMatchObject([
      {},
      { question: "Is there a two-week supply buffer?" },
      {},
      {},
      { category: "Reputational Risk" },
    ])

    await signField(database, he, record.id, "heSignature")

    await expect(submitRecord(database, he, record.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "riskAssessment", row: 4 }),
      ]),
    })

    await expect(
      updateRecord(database, he, record.id, {
        ...values,
        riskAssessment: rows.slice(1),
      })
    ).rejects.toThrow(ValidationError)
  })
})

describe("deciding", () => {
  beforeEach(async () => {
    await approveThroughFinance()
  })

  it("needs a decision, the strategic answer and the executive's signature", async () => {
    const record = await saveDraft(database, he, {
      projectId,
      toolId: "D2.5",
      cycle: 1,
      values: Object.fromEntries(
        Object.entries(review("Rejected")).filter(
          ([key]) => key !== "executiveDecision" && key !== "strategicAlignment"
        )
      ),
    })

    await expect(submitRecord(database, he, record.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "executiveDecision" }),
        expect.objectContaining({ field: "strategicAlignment" }),
      ]),
    })

    await updateRecord(database, he, record.id, review("Rejected"))

    await expect(submitRecord(database, he, record.id)).rejects.toMatchObject({
      errors: [{ field: "heSignature" }],
    })
  })

  it("locks on Approved for Client Transmission, filling in the date, and leaves the project active", async () => {
    const locked = await decide("Approved for Client Transmission")

    expect(locked.state).toBe("locked")
    expect(locked.payload.signOffDate).toBe(
      locked.lockedAt?.toISOString().slice(0, 10)
    )
    expect(await projectStatus()).toBe("active")
    expect((await current("D2.2")).state).toBe("locked")
    expect((await current("D2.4")).state).toBe("locked")
  })

  it("closes the project on Rejected, so nothing else can start", async () => {
    await decide("Rejected")

    expect(await projectStatus()).toBe("closed")
    expect(await openTools()).toEqual([])
    expect((await current("D2.2")).state).toBe("locked")
  })

  it("sends the draft back on Hold for Revision, then runs D2.3, D2.4 and D2.5 again in turn", async () => {
    const held = await decide("Hold for Revision")

    expect(held.state).toBe("locked")
    expect(await projectStatus()).toBe("active")

    const back = await current("D2.2")

    expect(back.state).toBe("draft")
    expect(await sentBackReason(database, back)).toBe(
      "D2.5 sent it back: Hold for Revision"
    )
    expect(await titlesFor(ca)).toContain("D2.2 was sent back to you")

    // The CA revises the draft and locks it again: only D2.3 reopens, for the
    // PM; D2.4 and D2.5 wait their turn.
    await relock(ca, back.id, draft, "caSignature")

    expect((await getDocumentControl(database, ca, back.id)).iteration).toBe(2)

    const pmAgain = await current("D2.3")

    expect(pmAgain.state).toBe("draft")
    expect(await sentBackReason(database, pmAgain)).toBe(
      "D2.2 was revised after D2.5 sent it back: review it again"
    )
    expect((await current("D2.4")).state).toBe("locked")
    expect((await current("D2.5")).state).toBe("locked")

    // The PM approves the revised draft: D2.4 reopens for the FO.
    await relock(pm, pmAgain.id, pmReview("Approved"), "pmSignature")

    const foAgain = await current("D2.4")

    expect(foAgain.state).toBe("draft")
    expect(foAgain.payload.foSignature).toBeUndefined()
    expect(await titlesFor(fo)).toContain("D2.4 is open again")
    expect((await current("D2.5")).state).toBe("locked")

    // The FO approves it too: D2.5 reopens for the executive.
    await relock(fo, foAgain.id, financeReview("Approved"), "foSignature")

    const heAgain = await current("D2.5")

    expect(heAgain.id).toBe(held.id)
    expect(heAgain.state).toBe("draft")
    expect(heAgain.payload.heSignature).toBeUndefined()
    expect(heAgain.payload.strategicAlignment).toBe("Yes")
    expect(await titlesFor(he)).toContain("D2.5 is open again")

    const approved = await relock(
      he,
      heAgain.id,
      review("Approved for Client Transmission"),
      "heSignature"
    )

    expect(approved.state).toBe("locked")
    expect((await getDocumentControl(database, he, heAgain.id)).iteration).toBe(
      2
    )
  })

  it("keeps D2.5 locked when the FO sends the revised draft back, and runs it again after", async () => {
    await decide("Hold for Revision")

    const back = await current("D2.2")

    await relock(ca, back.id, draft, "caSignature")
    await relock(
      pm,
      (await current("D2.3")).id,
      pmReview("Approved"),
      "pmSignature"
    )

    // The FO sends the revised draft back again.
    await relock(
      fo,
      (await current("D2.4")).id,
      financeReview("Revisions Required"),
      "foSignature"
    )

    expect((await current("D2.2")).state).toBe("draft")
    expect((await current("D2.5")).state).toBe("locked")

    // The CA revises it once more: D2.3 runs first, then D2.4, then D2.5.
    await relock(ca, back.id, draft, "caSignature")

    expect((await current("D2.3")).state).toBe("draft")
    expect((await current("D2.4")).state).toBe("locked")

    await relock(
      pm,
      (await current("D2.3")).id,
      pmReview("Approved"),
      "pmSignature"
    )

    expect((await current("D2.4")).state).toBe("draft")
    expect((await current("D2.5")).state).toBe("locked")

    await relock(
      fo,
      (await current("D2.4")).id,
      financeReview("Approved"),
      "foSignature"
    )

    expect((await current("D2.5")).state).toBe("draft")
  })

  it("keeps D2.4 and D2.5 locked when the PM sends the revised draft back", async () => {
    await decide("Hold for Revision")

    const back = await current("D2.2")

    await relock(ca, back.id, draft, "caSignature")
    await relock(
      pm,
      (await current("D2.3")).id,
      pmReview("Revisions Required"),
      "pmSignature"
    )

    expect((await current("D2.2")).state).toBe("draft")

    // Revised again: D2.3 runs again, and D2.4 still waits for it.
    await relock(ca, back.id, draft, "caSignature")

    expect((await current("D2.3")).state).toBe("draft")
    expect((await current("D2.4")).state).toBe("locked")
    expect((await current("D2.5")).state).toBe("locked")
  })
})

describe("on Tier 3", () => {
  it("sends T3.D2.2a back to the OM, then reopens D2.3 once it is signed and locked again", async () => {
    projectId = await addProject("Tier_3")
    pm = await addPerson("Kofi Mensah", ["PM"])
    fo = await addPerson("Akosua Darko", ["FO"])
    he = await addPerson("Kwame Asante", ["HE"])

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
    await addRecord("D2.4", financeReview("Approved"))
    await decide("Hold for Revision")

    expect((await getRecord(database, om, contract)).state).toBe("draft")
    expect(await titlesFor(om)).toContain("T3.D2.2a was sent back to you")

    await submitRecord(database, om, contract)
    await signField(database, fo, contract, "foSignature")
    await signField(database, pm, contract, "pmSignature")
    await signField(database, client, contract, "clientSignature")

    expect((await getRecord(database, om, contract)).state).toBe("locked")
    expect((await current("D2.3")).state).toBe("draft")
    expect((await current("D2.4")).state).toBe("locked")
    expect((await current("D2.5")).state).toBe("locked")
  })
})

describe("who sees it", () => {
  it("lets the HE write it, the PM, FO, CA and CR read it, and nobody else see it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, he, projectId, "D2.5", "write")).toBe(true)

    for (const reader of [pm, fo, ca, cr]) {
      expect(await can(database, reader, projectId, "D2.5", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.5", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.5", "read")).toBe(
        false
      )
    }

    const id = await addRecord("D2.5", review("Rejected"), "draft")

    await expect(
      updateRecord(database, fo, id, review("Hold for Revision"))
    ).rejects.toThrow(PermissionDeniedError)
  })

  it("lets the HE read the draft and both reviews it checks", async () => {
    for (const toolId of ["D2.2", "D2.3", "D2.4"]) {
      expect(await can(database, he, projectId, toolId, "read")).toBe(true)
      expect(await can(database, he, projectId, toolId, "write")).toBe(false)
    }
  })

  it("shows the justification's hint", () => {
    expect(
      d25.fields.find((field) => field.key === "justification")
    ).toMatchObject({
      placeholder: expect.stringContaining("critical foothold"),
    })
  })
})
