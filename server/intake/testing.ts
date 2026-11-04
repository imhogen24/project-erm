import type { createTestDatabase } from "@/db/testing"
import { defineTool } from "@/server/tools/define-tool"
import { tools } from "@/server/tools/registry"

type TestDatabase = ReturnType<typeof createTestDatabase>

// D1.1 as workbooks/wb01 defines it. server/ cannot import workbooks/, and the
// app registers the real one before the intake runs.
const statuses = ["Pending", "Reviewed", "Approved"]

export function registerD11() {
  if (tools.getTool("D1.1")) {
    return
  }

  tools.registerTool(
    defineTool({
      id: "D1.1",
      name: "Client Email / Web Form",
      workbook: "wb01",
      fields: [
        {
          key: "requestStatus",
          label: "Request status",
          type: "select",
          options: statuses,
          systemOptions: ["Approved"],
          required: true,
        },
        {
          key: "attachedFiles",
          label: "Attached files",
          type: "table",
          columns: [
            { key: "label", label: "Label", type: "text" },
            { key: "dateUploaded", label: "Date uploaded", type: "date" },
            { key: "fileLink", label: "File link", type: "fileLink" },
            {
              key: "status",
              label: "Status",
              type: "select",
              options: statuses,
              systemOptions: ["Approved"],
            },
          ],
        },
      ],
    })
  )
}

export const link = (key: string) => `https://utfs.io/f/${key}`

export type Tier1 = {
  requestId: string
  organisation?: string
  title?: string
  files?: unknown
  createdAt?: Date
}

export type Tier3 = Omit<Tier1, "title">

// The website writes these rows. A test writes them only to have something to
// read.
export function createIntakeFixtures(database: TestDatabase) {
  async function addTier1({
    requestId,
    organisation = "Acme",
    title = "Conveyor",
    files = [link("a")],
    createdAt = new Date("2026-11-01T09:00:00Z"),
  }: Tier1) {
    await database.pool.query(
      `INSERT INTO custom_engineering_submissions (
        custom_engineering_id, organization_name, contact_person, email,
        phone_number, site_location, project_scope, project_title,
        primary_objective, material_inputs, energy_and_information_inputs,
        transformation, outputs, file_attachments, terms_accepted_at,
        request_id, created_at, updated_at, notify_attempts
      ) VALUES (
        gen_random_uuid()::text, $2, 'Ama', 'ama@client.example.com',
        '0200000000', 'Accra', '["Design"]', $3, 'Move boxes', 'Steel', 'Power',
        'Cut and weld', 'A conveyor', $4, $5, $1, $5, $5, 0
      )`,
      [requestId, organisation, title, JSON.stringify(files), createdAt]
    )
  }

  async function addTier3({
    requestId,
    organisation = "Aquaresh",
    files = [link("b")],
    createdAt = new Date("2026-11-01T09:00:00Z"),
  }: Tier3) {
    await database.pool.query(
      `INSERT INTO drafting_digitization_submissions (
        drafting_digitization_id, organization_name, contact_person, email,
        phone_number, site_location, input_material_type, asset_condition,
        drafting_services, end_goal, drafting_standard, output_formats,
        file_attachment, terms_accepted_at, request_id, created_at, updated_at,
        notify_attempts
      ) VALUES (
        gen_random_uuid()::text, $2, 'Kofi', 'kofi@client.example.com',
        '0200000000', 'Kumasi', 'Paper drawings', 'Good', '["2D drafting"]',
        'Archive', 'ISO', '["DWG"]', $3, $4, $1, $4, $4, 0
      )`,
      [requestId, organisation, JSON.stringify(files), createdAt]
    )
  }

  async function addPerson(name: string) {
    const { rows } = await database.pool.query<{ id: string; email: string }>(
      "INSERT INTO people (name, email) VALUES ($1, $2) RETURNING id, email",
      [name, `${name.toLowerCase()}-${crypto.randomUUID()}@example.com`]
    )

    return rows[0]!
  }

  async function addItAdmin(name: string) {
    const person = await addPerson(name)

    await database.pool.query(
      "INSERT INTO person_company_roles (person_id, role) VALUES ($1, 'IT/Admin')",
      [person.id]
    )

    return person
  }

  return { addTier1, addTier3, addPerson, addItAdmin }
}
