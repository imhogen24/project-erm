import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import { createTestDatabase, resetTestData } from "@/db/testing"
import { CONTRACT_ADMIN, archiveTasks, contractVariables } from "@/lib/baseline"
import { coreVariables } from "@/lib/initial-draft"
import { requestChange } from "@/server/change-requests/change-requests"
import { changeControlsFor } from "@/server/change-requests/controls"
import { baselineStart, baselineValues } from "@/server/contract/baseline"
import { previewStates } from "@/server/pdf/previews"
import {
  PermissionDeniedError,
  can,
  mayRequestChange,
} from "@/server/permissions/permissions"
import {
  getRecord,
  saveDraft,
  signField,
  submitRecord,
  updateRecord,
} from "@/server/records/records"
import { validateRecord } from "@/server/records/validate"
import { defineTool } from "@/server/tools/define-tool"
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
import { t3d22a } from "./t3-d2-2a"

const database = createTestDatabase()

registerTestTools({ wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"] })

for (const tool of [d21, d22, t3d22a, d23, d24, d25, d26, d27]) {
  tools.registerTool(tool)
}

// WB02 keeps its real order: D2.6 waits for D2.5 locked with Approved for
// Client Transmission.
loadUnorderedWorkflow({ wb01: ["D1.14", "D1.15", "T3.D1.15a", "D1.16"] })

const APPROVED = "Approved for Client Transmission"

// The CA's locked D2.2, as far as D2.6 reads it.
const draft: JsonObject = {
  coreVariables: coreVariables.map((row, index) => ({
    variable: row.variable,
    value: ["Asante Mills", "Kofi Mensah", "GHS 94,400.00", "8 weeks"][index]!,
  })),
}

// A complete D2.6, with every task at `status`.
function baseline(status = "Done", ready = "Yes"): JsonObject {
  return {
    baseline: contractVariables.map((row) => ({
      variable: row.variable,
      baselineValue: "As approved",
      absoluteLimit: "No lower",
    })),
    archiveTasks: archiveTasks.map((task) => ({
      task,
      assignee: CONTRACT_ADMIN,
      status,
    })),
    readyForTransmittal: ready,
  }
}

let projectId: string

let ca: string

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

async function addRecord(toolId: string, payload: JsonObject = {}) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO tool_records (project_id, tool_id, state, payload, locked_at) VALUES ($1, $2, 'locked', $3, '2026-11-21T09:00:00Z') RETURNING id",
    [projectId, toolId, payload]
  )

  return rows[0]!.id
}

async function openTools() {
  return (await availableTools(database, projectId)).map((each) => each.toolId)
}

// D2.2 to D2.4 locked, which D2.5 follows.
async function reviewedDraft(decision: string) {
  await addRecord("D2.2", draft)
  await addRecord("D2.3", { operationalStatus: "Approved" })
  await addRecord("D2.4", { commercialStatus: "Approved" })

  return addRecord("D2.5", { executiveDecision: decision })
}

async function lockBaseline(values = baseline()) {
  const record = await saveDraft(database, ca, {
    projectId,
    toolId: "D2.6",
    cycle: 1,
    values,
  })

  await signField(database, ca, record.id, "caSignature")

  return submitRecord(database, ca, record.id)
}

beforeEach(async () => {
  await resetTestData(database)

  projectId = await addProject("Tier_1")
  ca = await addPerson("Gifty Ofori", ["CA"])

  await addRecord("D1.15", {
    budget: [{ value: 60000 }, { value: 34400 }],
  })
  await addRecord("D1.16")
  await addRecord("D2.1")
})

afterAll(async () => {
  await database.pool.end()
})

describe("where it opens", () => {
  it("opens once D2.5 is locked with Approved for Client Transmission only", async () => {
    const decision = await reviewedDraft("Hold for Revision")

    expect(await openTools()).not.toContain("D2.6")

    await database.pool.query(
      "UPDATE tool_records SET payload = $1 WHERE id = $2",
      [{ executiveDecision: APPROVED }, decision]
    )

    expect(await openTools()).toContain("D2.6")
  })

  it("opens on Tier 3 the same way", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("D1.16")
    await addRecord("D2.1")
    await addRecord("T3.D2.2a")
    await addRecord("D2.3", { operationalStatus: "Approved" })
    await addRecord("D2.4", { commercialStatus: "Approved" })
    await addRecord("D2.5", { executiveDecision: APPROVED })

    expect(await openTools()).toContain("D2.6")
  })
})

describe("where it starts", () => {
  it("starts 2.1 on D2.2's contract value and 2.3 on its duration, the rest empty", async () => {
    await addRecord("D2.2", draft)

    expect(await baselineStart(database, projectId)).toEqual({
      baseline: [
        {
          variable: "Total Contract Value (GHS)",
          baselineValue: "GHS 94,400.00",
        },
        { variable: "Advance Payment %", baselineValue: "" },
        { variable: "Total Project Timeline", baselineValue: "8 weeks" },
        { variable: "Warranty / Support SLA", baselineValue: "" },
      ],
    })
  })

  it("starts 2.1 on T3.D1.15a's total on Tier 3, and 2.3 empty", async () => {
    projectId = await addProject("Tier_3")

    await addRecord("T3.D1.15a", { totalT3ProjectValue: 12500 })
    await addRecord("T3.D2.2a")

    const start = await baselineStart(database, projectId)

    expect(start.baseline).toMatchObject([
      { baselineValue: "GHS 12,500.00" },
      { baselineValue: "" },
      { baselineValue: "" },
      { baselineValue: "" },
    ])
  })

  it("shows the project and client in 1.0", async () => {
    expect(await baselineValues(database, projectId)).toEqual({
      projectClientName: "Rice Mill / Asante Mills",
    })
  })

  it("shows the executive approval, D2.5, as a preview", async () => {
    await reviewedDraft(APPROVED)

    expect(
      (await previewStates(database, ca, projectId, d26)).executiveApproval
    ).toMatchObject({
      status: "ready",
      name: "D2.5 Executive Review Draft",
      href: `/api/projects/${projectId}/tools/D2.5/pdf`,
    })
  })

  it("shows the sheet's examples as hints", () => {
    const table = d26.fields.find((field) => field.key === "baseline")

    expect(table).toMatchObject({
      columns: expect.arrayContaining([
        expect.objectContaining({
          key: "baselineValue",
          placeholders: [
            "e.g. 173",
            "e.g. 40%",
            "e.g. 40 Working Days",
            "e.g. 30 Days Post-Delivery",
          ],
        }),
      ]),
    })
  })
})

describe("the tables", () => {
  it("refuse a change to a fixed variable, task or assignee", () => {
    const values = baseline()

    // SAFETY: baseline builds each table as an array of rows.
    const tasks = values.archiveTasks as JsonObject[]

    expect(
      validateRecord(
        "D2.6",
        {
          ...values,
          archiveTasks: [{ ...tasks[0], assignee: "PM" }, ...tasks.slice(1)],
        },
        { forSubmit: false }
      )
    ).toMatchObject({
      ok: false,
      errors: [{ field: "archiveTasks", row: 0, column: "assignee" }],
    })
  })

  it("take added rows after the fixed ones", () => {
    const values = baseline()

    expect(
      validateRecord(
        "D2.6",
        {
          ...values,
          // SAFETY: baseline builds each table as an array of rows.
          baseline: [
            ...(values.baseline as JsonObject[]),
            { variable: "Retention", baselineValue: "5%" },
          ],
        },
        { forSubmit: true }
      ).ok
    ).toBe(true)
  })
})

describe("locking the baseline", () => {
  beforeEach(async () => {
    await reviewedDraft(APPROVED)
  })

  it("is refused while a task is Pending or the baseline is not ready", async () => {
    await expect(lockBaseline(baseline("Pending", "No"))).rejects.toMatchObject(
      {
        errors: expect.arrayContaining([
          {
            field: "archiveTasks",
            message: "Mark every task Done before locking the baseline",
          },
          {
            field: "readyForTransmittal",
            message: "Answer Yes once the baseline is ready for transmittal",
          },
        ]),
      }
    )
  })

  it("is refused while one task of several is still Pending", async () => {
    const values = baseline()

    // SAFETY: baseline builds each table as an array of rows.
    const tasks = values.archiveTasks as JsonObject[]

    await expect(
      lockBaseline({
        ...values,
        archiveTasks: [
          ...tasks.slice(0, 2),
          { ...tasks[2], status: "Pending" },
        ],
      })
    ).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: "archiveTasks" })],
    })
  })

  it("locks with every task Done and Yes, filling in who and when", async () => {
    const locked = await lockBaseline()

    const day = locked.lockedAt?.toISOString().slice(0, 10)

    expect(locked.state).toBe("locked")
    expect(locked.payload).toMatchObject({
      lockExecutedBy: "Gifty Ofori",
      dateLocked: day,
      verificationDate: day,
    })
  })

  it("can never be changed once locked: no change request", async () => {
    const locked = await lockBaseline()

    expect(mayRequestChange(["CA"], "D2.6")).toBe(false)
    expect(mayRequestChange(["HE"], "D2.5")).toBe(true)

    await expect(
      requestChange(database, ca, locked.id, "The value was wrong")
    ).rejects.toThrow(PermissionDeniedError)

    const controls = await changeControlsFor(database, ca, projectId)

    expect(
      controls.records.find((each) => each.toolId === "D2.6")?.canRequest
    ).toBe(false)
    expect((await getRecord(database, ca, locked.id)).state).toBe("locked")
  })
})

describe("who sees it", () => {
  it("lets the CA write it, the PM, FO, HE and CR read it, and nobody else see it", async () => {
    const readers = [
      await addPerson("Ama Owusu", ["PM"]),
      await addPerson("Esi Badu", ["FO"]),
      await addPerson("Kwesi Appiah", ["HE"]),
      await addPerson("Yaw Boateng", ["CR"]),
    ]

    const om = await addPerson("Kofi Asare", ["OM"])
    const client = await addPerson("Akosua Client", ["Client"])

    expect(await can(database, ca, projectId, "D2.6", "write")).toBe(true)
    expect(await can(database, ca, projectId, "D2.5", "read")).toBe(true)

    for (const reader of readers) {
      expect(await can(database, reader, projectId, "D2.6", "read")).toBe(true)
      expect(await can(database, reader, projectId, "D2.6", "write")).toBe(
        false
      )
    }

    for (const stranger of [om, client]) {
      expect(await can(database, stranger, projectId, "D2.6", "read")).toBe(
        false
      )
    }

    await reviewedDraft(APPROVED)

    const record = await saveDraft(database, ca, {
      projectId,
      toolId: "D2.6",
      cycle: 1,
      values: baseline(),
    })

    await expect(
      updateRecord(database, readers[0]!, record.id, baseline("Pending"))
    ).rejects.toThrow(PermissionDeniedError)
  })
})

describe("a submit rule on a table column", () => {
  const fields = [
    {
      key: "tasks",
      label: "Tasks",
      type: "table" as const,
      columns: [
        {
          key: "status",
          label: "Status",
          type: "select" as const,
          options: ["Pending", "Done"],
        },
      ],
    },
  ]

  it("must name a select column holding the option", () => {
    expect(() =>
      defineTool({
        id: "X.1",
        name: "X",
        workbook: "wb02",
        submitWhen: [
          { field: "tasks", column: "status", is: "Finished", message: "m" },
        ],
        fields,
      })
    ).toThrow(/a select column status holding/)

    expect(() =>
      defineTool({
        id: "X.1",
        name: "X",
        workbook: "wb02",
        submitWhen: [
          { field: "tasks", column: "status", is: "Done", message: "m" },
        ],
        fields,
      })
    ).not.toThrow()
  })
})
