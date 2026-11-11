import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { JsonObject, Role } from "@/db/schema"
import {
  createTestDatabase,
  resetTestData,
  restoreSystemPerson,
} from "@/db/testing"
import type { ClientAnswers } from "@/lib/client-request-form"
import {
  decideChange,
  requestChange,
} from "@/server/change-requests/change-requests"
import { createFakeTransport } from "@/server/email/email"
import { PermissionDeniedError } from "@/server/permissions/permissions"
import {
  InvalidTransitionError,
  ValidationError,
} from "@/server/records/records"

import {
  NotAClientError,
  clientAnswersOf,
  isClientAccount,
  resubmitClientRequest,
  startClientProject,
} from "./client-requests"
import { registerD11 } from "./testing"

const database = createTestDatabase()

registerD11()

const tier1: ClientAnswers = {
  organization_name: "Tema Foods Ltd",
  contact_person: "Kwaku Ampofo, Plant Manager",
  email: "kwaku@temafoods.example",
  phone_number: "0244318075",
  site_location: "Tema Industrial Area, Accra",
  project_scope: ["Product Design"],
  project_title: "Juice pasteuriser upgrade",
  primary_objective: "Raise output from 2,000 to 3,500 litres an hour.",
  material_inputs: "Orange juice, plate heat exchanger",
  energy_and_information_inputs: "Steam from the boiler, 415 V supply",
  transformation: "Heat juice to 85 C, hold 15 seconds, then cool",
  outputs: "Pasteurised juice at 3,500 litres an hour",
}

const tier3: ClientAnswers = {
  organization_name: "Tarkwa Mines",
  contact_person: "Abena Owusu, Maintenance Lead",
  email: "abena@tarkwa.example",
  phone_number: "0201234567",
  site_location: "Pump station 3, Tarkwa",
  input_material_type: "Physical Part / Machine",
  asset_condition: "In service, no drawings kept since 2004",
  drafting_services: ["3D Solid Modeling (STEP/IGES)"],
  end_goal: "Spare parts drawings",
  drafting_standard: "ISO",
  output_formats: ["PDF", "STEP"],
}

async function addPerson(name: string, companyRoles: Role[] = []) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  for (const role of companyRoles) {
    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, $2)",
      [rows[0]!.id, role]
    )
  }

  return rows[0]!.id
}

async function addToProject(personId: string, projectId: string, role: Role) {
  await database.pool.query(
    "INSERT INTO person_project_roles (person_id, project_id, role) VALUES ($1, $2, $3)",
    [personId, projectId, role]
  )
}

// A client made their own account at /sign-up and confirmed their email.
async function addClient(name: string) {
  const { rows } = await database.pool.query<{ id: string }>(
    "INSERT INTO people (name, email, email_verified, account_type) VALUES ($1, $2, true, 'client') RETURNING id",
    [name, `${name.toLowerCase()}-${Math.random()}@example.com`]
  )

  return rows[0]!.id
}

function start(
  clientId: string,
  answers = tier1,
  track: "Tier_1" | "Tier_3" = "Tier_1"
) {
  return startClientProject(database, clientId, track, answers, {
    baseURL: "https://erm.example.com",
    transport: createFakeTransport(),
  })
}

async function d11Of(projectId: string) {
  const { rows } = await database.pool.query<{ id: string; state: string }>(
    "SELECT id, state FROM tool_records WHERE project_id = $1 AND tool_id = 'D1.1'",
    [projectId]
  )

  return rows[0]!
}

async function savedAnswers(projectId: string) {
  const { rows } = await database.pool.query<{
    submission: JsonObject
  }>("SELECT submission FROM intake_submissions WHERE project_id = $1", [
    projectId,
  ])

  return rows[0]!.submission
}

beforeEach(async () => {
  await resetTestData(database)
  await restoreSystemPerson(database)
})

afterAll(async () => {
  await database.pool.end()
})

describe("isClientAccount", () => {
  it("is true for a client account, even before it is on any project", async () => {
    expect(await isClientAccount(database, await addClient("Kwaku"))).toBe(true)
  })

  it("is false for a staff account with no role yet", async () => {
    expect(await isClientAccount(database, await addPerson("Yaw"))).toBe(false)
  })

  it("is false for a staff account that is Client on a project", async () => {
    const staff = await addPerson("Esi")
    const projectId = await start(await addClient("Kwaku"))

    await addToProject(staff, projectId, "Client")

    expect(await isClientAccount(database, staff)).toBe(false)
  })
})

describe("startClientProject", () => {
  it("makes an active project with D1.1 locked, and puts the client on it", async () => {
    const client = await addClient("Kwaku")
    const projectId = await start(client)

    const { rows } = await database.pool.query<{
      name: string
      service_track: string
      status: string
      request_id: string
    }>("SELECT * FROM projects WHERE id = $1", [projectId])

    expect(rows[0]).toMatchObject({
      name: "Juice pasteuriser upgrade",
      service_track: "Tier_1",
      status: "active",
    })
    expect(rows[0]!.request_id).toMatch(/^T1-\d+$/)
    expect((await d11Of(projectId)).state).toBe("locked")

    const roles = await database.pool.query<{ role: string }>(
      "SELECT role FROM person_project_roles WHERE person_id = $1 AND project_id = $2",
      [client, projectId]
    )

    expect(roles.rows.map((row) => row.role)).toEqual(["Client"])
  })

  it("saves the answers under the website's column names", async () => {
    const projectId = await start(await addClient("Kwaku"))

    expect(await savedAnswers(projectId)).toMatchObject({
      organization_name: "Tema Foods Ltd",
      project_scope: ["Product Design"],
      file_attachments: [],
    })
  })

  it("starts a Tier 3 project the same way", async () => {
    const projectId = await start(await addClient("Abena"), tier3, "Tier_3")

    expect((await d11Of(projectId)).state).toBe("locked")
    expect(await savedAnswers(projectId)).toMatchObject({
      drafting_standard: "ISO",
      file_attachment: [],
    })
  })

  it("refuses answers the website would refuse, naming each field", async () => {
    const attempt = start(await addClient("Kwaku"), {
      ...tier1,
      email: "not an email",
      project_scope: [],
    })

    await expect(attempt).rejects.toBeInstanceOf(ValidationError)
    await expect(attempt).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "email" }),
        expect.objectContaining({ field: "project_scope" }),
      ]),
    })
  })

  it("refuses a staff account", async () => {
    const admin = await addPerson("Kofi", ["IT/Admin"])

    await expect(start(admin)).rejects.toBeInstanceOf(NotAClientError)
  })
})

describe("resubmitClientRequest", () => {
  it("refuses while D1.1 is locked", async () => {
    const client = await addClient("Kwaku")
    const projectId = await start(client)

    await expect(
      resubmitClientRequest(database, client, projectId, tier1)
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it("replaces the answers and locks D1.1 again once a change is approved", async () => {
    const client = await addClient("Kwaku")
    const projectId = await start(client)
    const om = await addPerson("Kwabena")
    const pm = await addPerson("Ama")

    await addToProject(om, projectId, "OM")
    await addToProject(pm, projectId, "PM")

    const d11 = await d11Of(projectId)

    const request = await requestChange(
      database,
      om,
      d11.id,
      "The site address is out of date"
    )

    await decideChange(database, pm, request.id, { outcome: "approved" })

    expect((await d11Of(projectId)).state).toBe("draft")

    const before = await clientAnswersOf(database, client, projectId)

    expect(before?.answers.site_location).toBe("Tema Industrial Area, Accra")

    await resubmitClientRequest(database, client, projectId, {
      ...tier1,
      site_location: "Plot 12, Tema Industrial Area, Accra",
    })

    expect((await d11Of(projectId)).state).toBe("locked")
    expect((await savedAnswers(projectId)).site_location).toBe(
      "Plot 12, Tema Industrial Area, Accra"
    )
  })

  it("refuses a person who may not write D1.1", async () => {
    const projectId = await start(await addClient("Kwaku"))
    const om = await addPerson("Kwabena")

    await addToProject(om, projectId, "OM")

    await expect(
      resubmitClientRequest(database, om, projectId, tier1)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
