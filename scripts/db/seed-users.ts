import { hashPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"

import { createDatabase, type Database } from "@/db"
import {
  accounts,
  intakeSubmissions,
  people,
  personCompanyRoles,
  personProjectRoles,
  projects,
  roles,
  toolRecords,
  type JsonObject,
  type Role,
} from "@/db/schema"

import {
  emailOf,
  holdsCompanyWide,
  loginFor,
  staff,
  staffByHandle,
} from "./seed-data/people"
import {
  featuredProject,
  isTier3,
  projects as seedProjects,
  requestIdOf,
  type SeedProject,
} from "./seed-data/projects"

export type SeedUser = { role: Role; email: string }

export const SEED_PASSWORD = "password"

function assertLocal(url: string) {
  const { hostname } = new URL(url)

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to seed a database that is not local: ${hostname}`
    )
  }
}

async function findOrCreateProject(database: Database, project: SeedProject) {
  const [existing] = await database
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, project.name))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [created] = await database
    .insert(projects)
    .values({
      name: project.name,
      requestId: requestIdOf(project),
      serviceTrack: project.serviceTrack,
      status: project.status,
      createdAt: new Date(project.received),
    })
    .returning({ id: projects.id })

  return created!.id
}

// The website's own copy of the row, shaped as the website saves it, so the
// screens that read it have something to show. It is only added when the
// request has no copy yet, so running this again changes nothing.
function submissionOf(project: SeedProject): JsonObject {
  const { request, client } = project

  const shared = {
    organization_name: client.organisation,
    contact_person: client.name,
    email: client.email,
    phone_number: client.phone,
    site_location: project.site,
  }

  const tracking = {
    request_id: requestIdOf(project),
    created_at: project.received,
    terms_accepted_at: project.received,
  }

  if (isTier3(request)) {
    return {
      ...shared,
      input_material_type: request.inputMaterialType,
      asset_condition: request.assetCondition,
      drafting_services: request.services,
      end_goal: request.endGoal,
      drafting_standard: request.standard,
      output_formats: request.outputFormats,
      ...tracking,
    }
  }

  const row: JsonObject = {
    ...shared,
    project_scope: request.scope,
    project_title: request.title,
    primary_objective: request.objective,
    material_inputs: request.materialInputs,
    energy_and_information_inputs: request.energyInputs,
    transformation: request.transformation,
    outputs: request.outputs,
    ...tracking,
  }

  if (request.byProducts) {
    row.by_products = request.byProducts
  }

  if (request.budget) {
    row.budget_expectations = request.budget
  }

  if (request.timeline) {
    row.target_timeline = request.timeline
  }

  return row
}

async function addRequest(
  database: Database,
  project: SeedProject,
  projectId: string
) {
  await database
    .insert(intakeSubmissions)
    .values({
      requestId: requestIdOf(project),
      serviceTrack: project.serviceTrack,
      projectId,
      submission: submissionOf(project),
      receivedAt: new Date(project.received),
    })
    .onConflictDoNothing({ target: intakeSubmissions.requestId })
}

// Each tool the demo project has already been through. The next tool only
// opens once the one before it is locked, so a developer building a tool can
// open it on the featured project without working through the tools before it. When a
// tool is built, add the tool before it here, locked, and name the tool it
// opens. A record is only added when the project has none for that tool yet,
// so running this again changes nothing and a record someone is working on is
// left alone.
const demoRecords: { toolId: string; payload: JsonObject }[] = [
  {
    // Two sample files, so D1.2 has files to show.
    toolId: "D1.1",
    payload: {
      requestStatus: "Approved",
      attachedFiles: [
        {
          label: "Site photo",
          dateUploaded: "2026-11-03",
          fileLink: "https://utfs.io/f/demo-site-photo",
          status: "Approved",
        },
        {
          label: "Layout drawing",
          dateUploaded: "2026-11-03",
          fileLink: "https://utfs.io/f/demo-layout-drawing",
          status: "Approved",
        },
      ],
    },
  },
  {
    // Approved with Proceed to D1.3, so D1.3 is open.
    toolId: "D1.2",
    payload: {
      digitalRecords: [
        { fileName: "Site photo" },
        { fileName: "Layout drawing" },
      ],
      triageChecklist: [
        {
          check: "Is the notification readable and free of malicious links?",
          status: "Pass",
          reviewerNotes: "Readable, no links",
        },
        {
          check: "Does the request broadly align with IMHOGEN's services?",
          status: "Pass",
          reviewerNotes: "Within scope",
        },
        {
          check: "Is the contact information apparently valid and legible?",
          status: "Pass",
          reviewerNotes: "Email and phone check out",
        },
      ],
      triageDecision: "Proceed to D1.3",
    },
  },
]

async function addDemoRecords(database: Database, projectId: string) {
  for (const { toolId, payload } of demoRecords) {
    const [existing] = await database
      .select({ id: toolRecords.id })
      .from(toolRecords)
      .where(
        and(
          eq(toolRecords.projectId, projectId),
          eq(toolRecords.toolId, toolId)
        )
      )
      .limit(1)

    if (!existing) {
      await database
        .insert(toolRecords)
        .values({ projectId, toolId, state: "locked", payload })
    }
  }
}

// Four notifications for the featured project's PM, so the bell has something to show:
// three unread (the number on the bell) and one older one already read. Each is
// only added when the PM has no notification with that title yet, so running
// this again changes nothing, and one the PM has opened is not made unread
// again. Notifications cannot be deleted, so this only ever adds.
async function addDemoNotifications(database: Database, projectId: string) {
  const [pm] = await database
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, loginFor("PM")))
    .limit(1)

  if (!pm) {
    return
  }

  const minutes = 60 * 1000
  const now = Date.now()

  const samples = [
    {
      title: `D1.2 is ready for review on ${featuredProject.name}`,
      path: `/projects/${projectId}/tools/D1.2`,
      createdAt: new Date(now - 5 * minutes),
      read: false,
    },
    {
      title: `D1.1 was approved on ${featuredProject.name}`,
      path: `/projects/${projectId}/tools/D1.1`,
      createdAt: new Date(now - 3 * 60 * minutes),
      read: false,
    },
    {
      title: `You were added to ${featuredProject.name}`,
      path: `/projects/${projectId}`,
      createdAt: new Date(now - 26 * 60 * minutes),
      read: false,
    },
    {
      title: `${featuredProject.client.organisation} request received`,
      path: `/projects/${projectId}`,
      createdAt: new Date(now - 3 * 24 * 60 * minutes),
      read: true,
    },
  ]

  for (const sample of samples) {
    await database.pool.query(
      `INSERT INTO notifications (person_id, kind, title, path, created_at, read_at)
       SELECT $1::uuid, 'tool_open', $2::text, $3::text, $4::timestamptz, $5::timestamptz
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications WHERE person_id = $1::uuid AND title = $2::text
       )`,
      [
        pm.id,
        sample.title,
        sample.path,
        sample.createdAt,
        sample.read ? sample.createdAt : null,
      ]
    )
  }
}

// The id of the featured project, for the links the preview guide prints.
export async function featuredProjectId(url: string) {
  assertLocal(url)

  const database = createDatabase(url)

  try {
    const [project] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, featuredProject.name))
      .limit(1)

    return project?.id
  } finally {
    await database.pool.end()
  }
}

// Each person is checked before adding, so running this again changes nothing
// and only what is missing is added back. A password already set is kept.
// Returns the person's id and whether they were new.
async function addPerson(
  database: Database,
  person: { name: string; email: string },
  passwordHash: string
) {
  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, person.email))
      .limit(1)

    let personId = existing?.id

    if (!personId) {
      const [created] = await transaction
        .insert(people)
        .values({ name: person.name, email: person.email, emailVerified: true })
        .returning({ id: people.id })

      personId = created!.id
    }

    const [account] = await transaction
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(
        and(
          eq(accounts.personId, personId),
          eq(accounts.providerId, "credential")
        )
      )
      .limit(1)

    if (!account) {
      await transaction.insert(accounts).values({
        personId,
        accountId: personId,
        providerId: "credential",
        password: passwordHash,
      })
    } else if (!account.password) {
      await transaction
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, account.id))
    }

    return { id: personId, isNew: !existing }
  })
}

// The roles each person holds on the project. "everyone" is one person for
// every role, and every project has its client.
function rolesOnProject(project: SeedProject) {
  const held: { handle: string; role: Role }[] = []

  if (project.team === "everyone") {
    for (const role of roles) {
      const first = staff.find((person) => person.role === role)

      if (first && role !== "IT/Admin") {
        held.push({ handle: first.handle, role })
      }
    }
  } else {
    for (const role of roles) {
      for (const handle of project.team[role] ?? []) {
        held.push({ handle, role })
      }
    }
  }

  return held
}

async function giveProjectRole(
  database: Database,
  personId: string,
  projectId: string,
  role: Role
) {
  await database
    .insert(personProjectRoles)
    .values({ personId, projectId, role })
    .onConflictDoNothing()
}

// Local development only: IMHOGEN's staff, ten projects at different stages
// with their clients, and the teams on them. Everyone signs in with the
// password `password`. IT/Admin holds the role company-wide, and the roles in
// qualifiedRoles are also held as a qualification. Returns the people this run
// added.
export async function seed(url: string): Promise<SeedUser[]> {
  assertLocal(url)

  const database = createDatabase(url)

  try {
    const passwordHash = await hashPassword(SEED_PASSWORD)
    const created: SeedUser[] = []
    const ids = new Map<string, string>()
    let featuredId: string | undefined

    for (const person of staff) {
      const email = emailOf(person.handle)

      const added = await addPerson(
        database,
        { name: person.name, email },
        passwordHash
      )

      ids.set(person.handle, added.id)

      if (holdsCompanyWide(person.role)) {
        await database
          .insert(personCompanyRoles)
          .values({ personId: added.id, role: person.role })
          .onConflictDoNothing()
      }

      if (added.isNew) {
        created.push({ role: person.role, email })
      }
    }

    for (const project of seedProjects) {
      const projectId = await findOrCreateProject(database, project)

      await addRequest(database, project, projectId)

      const client = await addPerson(database, project.client, passwordHash)

      await giveProjectRole(database, client.id, projectId, "Client")

      if (client.isNew) {
        created.push({ role: "Client", email: project.client.email })
      }

      for (const { handle, role } of rolesOnProject(project)) {
        staffByHandle(handle)

        await giveProjectRole(database, ids.get(handle)!, projectId, role)
      }

      if (project === featuredProject) {
        featuredId = projectId
        await addDemoRecords(database, projectId)
      }
    }

    // After the people loop, because the notifications belong to the PM.
    if (featuredId) {
      await addDemoNotifications(database, featuredId)
    }

    return created
  } finally {
    await database.pool.end()
  }
}
