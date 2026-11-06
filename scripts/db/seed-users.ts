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
  type Role,
} from "@/db/schema"

export type SeedUser = { role: Role; email: string }

export const SEED_PASSWORD = "password"

const PROJECT_NAME = "Demo Project"

// Shaped like a website request ID, so screens show what a real one looks like.
export const DEMO_REQUEST_ID = "T1-1789787898386"

// These people are qualified for their role, so they can be assigned it on any
// project, and also hold it on Demo Project. A qualification alone gives no
// access.
const QUALIFIED: readonly Role[] = ["OM", "PM", "HE", "FO"]

// "IT/Admin" becomes "it-admin@example.com".
export function seedEmail(role: Role) {
  return `${role.toLowerCase().replace("/", "-")}@example.com`
}

function assertLocal(url: string) {
  const { hostname } = new URL(url)

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to seed a database that is not local: ${hostname}`
    )
  }
}

async function findOrCreateProject(database: Database) {
  const [existing] = await database
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.name, PROJECT_NAME))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [created] = await database
    .insert(projects)
    .values({
      name: PROJECT_NAME,
      requestId: DEMO_REQUEST_ID,
      serviceTrack: "Tier_1",
    })
    .returning({ id: projects.id })

  return created!.id
}

// The website's saved copy of the demo request, shaped like a real one, so the
// screens that read it have something to show. It is only added when the
// request has no copy yet, so running this again changes nothing.
async function addDemoRequest(database: Database, projectId: string) {
  await database
    .insert(intakeSubmissions)
    .values({
      requestId: DEMO_REQUEST_ID,
      serviceTrack: "Tier_1",
      projectId,
      submission: {
        organization_name: "Demo Client Ltd",
        contact_person: "Demo Client",
        email: seedEmail("Client"),
        phone_number: "0200000000",
        site_location: "Tema Industrial Area, Accra",
        project_scope: ["Product Design", "Process / Factory Design"],
        project_title: "Demo Boiler Skid",
        primary_objective:
          "A packaged boiler skid for a food plant, ready to connect to site steam lines.",
        material_inputs: "Carbon steel plate, stainless piping",
        energy_and_information_inputs: "415 V supply, PLC signals",
        transformation: "Cut, weld and assemble onto a single skid frame",
        outputs: "One skid with drawings and a test report",
        by_products: "Offcuts and weld spatter",
        budget_expectations: "GHS 400,000",
        target_timeline: "12 weeks",
        request_id: DEMO_REQUEST_ID,
        created_at: "2026-11-03T09:14:00+00:00",
      },
    })
    .onConflictDoNothing({ target: intakeSubmissions.requestId })
}

// An approved D1.1 with two sample files, so D1.2 is open and has files to show.
// It is only added when the project has no D1.1 yet, so running this again
// changes nothing and a D1.1 someone is working on is left alone.
async function addDemoReview(database: Database, projectId: string) {
  const [existing] = await database
    .select({ id: toolRecords.id })
    .from(toolRecords)
    .where(
      and(eq(toolRecords.projectId, projectId), eq(toolRecords.toolId, "D1.1"))
    )
    .limit(1)

  if (existing) {
    return
  }

  await database.insert(toolRecords).values({
    projectId,
    toolId: "D1.1",
    state: "locked",
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
  })
}

// The id of Demo Project, for the links the preview guide prints.
export async function demoProjectId(url: string) {
  assertLocal(url)

  const database = createDatabase(url)

  try {
    const [project] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, PROJECT_NAME))
      .limit(1)

    return project?.id
  } finally {
    await database.pool.end()
  }
}

// Each person is checked before adding, so running this again changes nothing
// and only what is missing is added back. A password already set is kept.
// Returns whether the person was new.
async function addPerson(
  database: Database,
  projectId: string,
  role: Role,
  passwordHash: string
) {
  const email = seedEmail(role)

  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, email))
      .limit(1)

    let personId = existing?.id

    if (!personId) {
      const [person] = await transaction
        .insert(people)
        .values({ name: `Demo ${role}`, email, emailVerified: true })
        .returning({ id: people.id })

      personId = person!.id
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

    // IT/Admin sees every project, so it is held company-wide only.
    if (role === "IT/Admin" || QUALIFIED.includes(role)) {
      await transaction
        .insert(personCompanyRoles)
        .values({ personId, role })
        .onConflictDoNothing()
    }

    if (role !== "IT/Admin") {
      await transaction
        .insert(personProjectRoles)
        .values({ personId, projectId, role })
        .onConflictDoNothing()
    }

    return !existing
  })
}

// Local development only: one person per role, all with the password
// `password`. Each holds their role on "Demo Project", except IT/Admin, who
// holds it company-wide. The roles in QUALIFIED are also given as a
// qualification. Returns the people this run added.
export async function seed(url: string): Promise<SeedUser[]> {
  assertLocal(url)

  const database = createDatabase(url)

  try {
    const projectId = await findOrCreateProject(database)

    await addDemoRequest(database, projectId)
    await addDemoReview(database, projectId)

    const passwordHash = await hashPassword(SEED_PASSWORD)
    const created: SeedUser[] = []

    for (const role of roles) {
      if (await addPerson(database, projectId, role, passwordHash)) {
        created.push({ role, email: seedEmail(role) })
      }
    }

    return created
  } finally {
    await database.pool.end()
  }
}
