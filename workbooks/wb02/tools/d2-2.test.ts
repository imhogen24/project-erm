import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import {
  appendices,
  coreVariables,
  legalDirectives,
  paymentSchedules,
  phases,
} from "@/lib/initial-draft"
import {
  draftFills,
  draftStart,
  draftValues,
} from "@/server/contract/initial-draft"
import { sectionsOf } from "@/server/pdf/record-document"
import { previewStates } from "@/server/pdf/previews"
import { PermissionDeniedError, can } from "@/server/permissions/permissions"
import {
  ValidationError,
  getRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { validateRecord } from "@/server/records/validate"
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

registerTestTools({ wb01: ["D1.3", "D1.15", "D1.16"] })

tools.registerTool(d21)

tools.registerTool(d22)

// WB02's map names the Tier 3 variant beside D2.2.
tools.registerTool(t3d22a)

// WB02's map names D2.3 after the draft, D2.4 after D2.3 and D2.5 after
// D2.4.
tools.registerTool(d23)

tools.registerTool(d24)

tools.registerTool(d25)

tools.registerTool(d26)

tools.registerTool(d27)

tools.registerTool(d28)

// WB02 keeps its real order: D2.2 waits for D2.1.
loadUnorderedWorkflow({ wb01: ["D1.3", "D1.15", "D1.16"] })

// What the form sends for the tables before the CA adds a row.
const draft = {
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

let projectId: string

let ca: string

let pm: string

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

async function addRecord(toolId: string, state: string, payload: JsonObject) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload) VALUES ($1, $2, $3, $4) RETURNING id",
    [projectId, toolId, state, payload]
  )

  return rows[0]!.id
}

beforeEach(async () => {
  await resetTestData(database)

  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO projects (name, request_id, service_track) VALUES ('Rice Mill', 'T1-42', 'Tier_1') RETURNING id"
  )

  projectId = rows[0]!.id

  await database.pool.query(
    "INSERT INTO intake_submissions (request_id, service_track, project_id, submission) VALUES ('T1-42', 'Tier_1', $1, $2)",
    [
      projectId,
      { organization_name: "Asante Mills", contact_person: "Kwame Asante" },
    ]
  )

  ca = await addPerson("Gifty Ofori", ["CA"])
  pm = await addPerson("Ama Owusu", ["PM"])

  await addRecord("D1.15", "locked", {
    phases: [
      { deliverables: "Survey and drawings", duration: "3 weeks" },
      { deliverables: "Fabrication", duration: "6 weeks" },
    ],
    budget: [
      { value: 60000, paymentSchedule: "40% at signing" },
      { value: 34400, paymentSchedule: "60% on handover" },
    ],
  })
  await addRecord("D1.16", "locked", {})
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens once D2.1 is locked, and not before", async () => {
    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).not.toContain("D2.2")

    await addRecord("D2.1", "locked", {})

    expect(
      (await availableTools(database, projectId)).map((each) => each.toolId)
    ).toContain("D2.2")
  })
})

describe("where it starts", () => {
  it("starts 2.0, 3.0 and 4.0 from the client's name and D1.15's figures", async () => {
    expect(await draftStart(database, projectId)).toEqual({
      coreVariables: [
        { variable: "Client Legal Entity Name", value: "Asante Mills" },
        { variable: "Primary Client Signatory", value: "Kwame Asante" },
        { variable: "Total Contract Value (GHS)", value: "GHS 94,400.00" },
        { variable: "Project Duration / Timeline", value: "" },
      ],
      paymentMilestones: [
        { milestone: "Payment Schedule 1", schedule: "40% at signing" },
        { milestone: "Payment Schedule 2", schedule: "60% on handover" },
        { milestone: "Payment Schedule 3", schedule: "" },
      ],
      projectMilestones: [
        { milestone: "Phase 1", timeline: "3 weeks" },
        { milestone: "Phase 2", timeline: "6 weeks" },
        { milestone: "Phase 3", timeline: "" },
      ],
    })
  })

  it("takes the duration D1.15 shows, from D1.12", async () => {
    await addRecord("D1.12", "locked", { realisticTimeline: "40 days" })

    expect(
      (await draftStart(database, projectId)).coreVariables
    ).toContainEqual({
      variable: "Project Duration / Timeline",
      value: "40 days",
    })
  })

  it("shows 1.0's PM, project and client, and the brief's total", async () => {
    expect(await draftValues(database, projectId)).toEqual({
      projectManager: "Ama Owusu",
      projectClientName: "Rice Mill / Asante Mills",
      projectValue: "GHS 94,400.00",
    })
  })

  it("fills 5.0 with D1.15's key deliverables, and a dash for a phase it lacks", async () => {
    expect(await draftFills(database, projectId)).toEqual({
      "Phase 1 Key Deliverables": "Survey and drawings",
      "Phase 2 Key Deliverables": "Fabrication",
      "Phase 3 Key Deliverables": "—",
    })
  })
})

describe("the tables", () => {
  it("refuse a change to a fixed row's label", () => {
    expect(
      validateRecord(
        "D2.2",
        {
          ...draft,
          paymentMilestones: [
            { milestone: "Deposit", schedule: "40%" },
            ...draft.paymentMilestones.slice(1),
          ],
        },
        { forSubmit: false }
      )
    ).toMatchObject({
      ok: false,
      errors: [{ field: "paymentMilestones", row: 0, column: "milestone" }],
    })
  })

  it("refuse a fixed row taken out", () => {
    expect(
      validateRecord(
        "D2.2",
        { coreVariables: draft.coreVariables.slice(1) },
        { forSubmit: false }
      ).ok
    ).toBe(false)
  })

  it("let a row be added after the fixed ones, which needs its cells at submit", () => {
    expect(
      validateRecord(
        "D2.2",
        {
          ...draft,
          coreVariables: [
            ...draft.coreVariables,
            { variable: "Retention", value: "5%" },
          ],
        },
        { forSubmit: true }
      ).ok
    ).toBe(true)

    expect(
      validateRecord(
        "D2.2",
        { ...draft, projectMilestones: [...draft.projectMilestones, {}] },
        { forSubmit: true }
      )
    ).toMatchObject({
      ok: false,
      errors: [
        { field: "projectMilestones", row: 3, column: "milestone" },
        { field: "projectMilestones", row: 3, column: "timeline" },
      ],
    })
  })

  it("never store a source reference, which is only shown", () => {
    expect(
      validateRecord(
        "D2.2",
        {
          coreVariables: [
            { ...draft.coreVariables[0], source: "D1.3" },
            ...draft.coreVariables.slice(1),
          ],
        },
        { forSubmit: false }
      ).ok
    ).toBe(false)
  })

  it("show each fixed row's source reference as a PDF of its tool", async () => {
    const states = await previewStates(database, ca, projectId, d22)

    expect(states["coreVariables.0.source"]).toMatchObject({
      status: "notStarted",
      name: "D1.3 Test D1.3",
    })
    expect(states["coreVariables.2.source"]).toMatchObject({
      status: "ready",
      href: `/api/projects/${projectId}/tools/D1.15/pdf`,
    })
    expect(states["deliverables.2.source"]).toMatchObject({ status: "ready" })
    expect(states.referenceHandoff).toMatchObject({ status: "ready" })
    expect(states["coreVariables.4.source"]).toBeUndefined()
  })

  it("name each source and fill 5.0 in the PDF", async () => {
    const sections = sectionsOf(
      d22,
      {},
      new Map(),
      "Tier_1",
      await draftFills(database, projectId)
    )

    const core = sections.find(
      (section) => section.title === "2.0 Core contract variables"
    )

    const deliverables = sections.find(
      (section) => section.title === "5.0 Project deliverables (from D1.15)"
    )

    expect(core?.kind === "table" && core.rows[0]).toEqual([
      "2.1",
      "Client Legal Entity Name",
      "—",
      "D1.3 Test D1.3",
    ])
    expect(deliverables?.kind === "table" && deliverables.rows[0]![2]).toBe(
      "Survey and drawings"
    )
  })
})

describe("submitting", () => {
  async function drafted(values: JsonObject = draft) {
    await addRecord("D2.1", "locked", {})

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.2",
      cycle: 1,
      values,
    })

    return (await signField(database, ca, record.id, "caSignature")).id
  }

  it("is refused while either routing answer is No", async () => {
    const id = await drafted({ ...draft, readyForPmReview: "No" })

    await expect(submitRecord(database, ca, id)).rejects.toThrow(
      ValidationError
    )
    await expect(submitRecord(database, ca, id)).rejects.toMatchObject({
      errors: [
        {
          field: "readyForPmReview",
          message: "Answer Yes once the draft is ready for the PM's review",
        },
      ],
    })
    expect((await getRecord(database, ca, id)).state).toBe("draft")
  })

  it("locks it with both Yes, filling in who drafted it and the dates", async () => {
    const id = await drafted()
    const locked = await submitRecord(database, ca, id)
    const today = new Date().toISOString().slice(0, 10)

    expect(locked).toMatchObject({
      state: "locked",
      submittedBy: ca,
      approvedBy: ca,
    })
    expect(locked.payload).toMatchObject({
      draftedBy: "Gifty Ofori",
      draftDate: today,
      routingDate: today,
    })
  })
})

describe("who sees it", () => {
  it("lets only the CA write it, and the PM, HE and CR read it", async () => {
    const cr = await addPerson("Yaw Boateng", ["CR"])
    const om = await addPerson("Kofi Asare", ["OM"])
    const he = await addPerson("Esi Badu", ["HE"])
    const client = await addPerson("Akosua Client", ["Client"])

    // The HE reads it to review the draft in D2.5.
    for (const reader of [pm, he, cr]) {
      expect(await can(database, reader, projectId, "D2.2", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.2", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.2", "read")).toBe(
        false
      )
    }

    const id = await addRecord("D2.2", "draft", draft)

    await expect(
      updateRecord(database, pm, id, { ...draft, readyForPmReview: "No" })
    ).rejects.toThrow(PermissionDeniedError)
  })
})
