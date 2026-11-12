import { hashPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createDatabase, type Database } from "@/db"
import {
  accounts,
  changeRequests,
  intakeSubmissions,
  people,
  personCompanyRoles,
  personProjectRoles,
  projects,
  roles,
  toolRecords,
  type JsonObject,
  type AccountType,
  type Role,
} from "@/db/schema"

import { projectChangeRequests, projectRecords } from "./seed-data/records"
import {
  emailOf,
  holdsCompanyWide,
  staff,
  staffByHandle,
} from "./seed-data/people"
import {
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

const HOUR = 60 * 60 * 1000

const DAY = 24 * HOUR

type Team = Map<Role, string>

// The person holding a role on the project, for who prepared and approved.
function holderOf(team: Team, role: Role) {
  return team.get(role) ?? null
}

// A seeded attendee names a role ("role:OM"), since people's ids are only
// known once they are added; this puts in the person holding it.
const attendee = z.object({ personId: z.string() }).passthrough()

function withTeamIds(payload: JsonObject, team: Team): JsonObject {
  const attendees = z.array(attendee).safeParse(payload.imhogenAttendees)

  if (!attendees.success) {
    return payload
  }

  return {
    ...payload,
    imhogenAttendees: attendees.data.map((each) => {
      const role = roles.find((held) => `role:${held}` === each.personId)

      return { ...each, personId: (role && team.get(role)) ?? each.personId }
    }),
  }
}

// Each project's records, at the stage written in seed-data/records.ts. The OM
// prepares a record and the PM approves it, a few hours apart, so the title
// block shows real names and times. A record is only added when the project
// has none for that tool yet, so running this again changes nothing and a
// record someone is working on is left alone.
async function addRecords(
  database: Database,
  project: SeedProject,
  projectId: string,
  team: Team
) {
  const received = Date.parse(project.received)
  const recordIds = new Map<string, string>()

  for (const record of projectRecords.get(project.name) ?? []) {
    const [existing] = await database
      .select({ id: toolRecords.id })
      .from(toolRecords)
      .where(
        and(
          eq(toolRecords.projectId, projectId),
          eq(toolRecords.toolId, record.toolId)
        )
      )
      .limit(1)

    if (existing) {
      recordIds.set(record.toolId, existing.id)

      continue
    }

    const started = new Date(received + record.day * DAY + 2 * HOUR)
    const submitted = new Date(started.getTime() + 3 * HOUR)
    const approved = new Date(submitted.getTime() + 5 * HOUR)
    const done = record.state === "locked"

    const [inserted] = await database
      .insert(toolRecords)
      .values({
        projectId,
        toolId: record.toolId,
        state: record.state,
        payload: withTeamIds(record.payload, team),
        createdAt: started,
        updatedAt: done ? approved : submitted,
        submittedBy: record.state === "draft" ? null : holderOf(team, "OM"),
        submittedAt: record.state === "draft" ? null : submitted,
        approvedBy: done ? holderOf(team, "PM") : null,
        approvedAt: done ? approved : null,
        lockedAt: done ? approved : null,
      })
      .returning({ id: toolRecords.id })

    recordIds.set(record.toolId, inserted!.id)
  }

  for (const request of projectChangeRequests.get(project.name) ?? []) {
    const recordId = recordIds.get(request.toolId)
    const requestedBy = holderOf(team, "OM")

    if (!recordId || !requestedBy) {
      continue
    }

    await database
      .insert(changeRequests)
      .values({
        projectId,
        recordId,
        reason: request.reason,
        requestedBy,
        createdAt: new Date(received + request.day * DAY),
      })
      .onConflictDoNothing()
  }
}

type Note = {
  personId: string
  kind: "approval_needed" | "change_waiting" | "assigned" | "tool_open"
  title: string
  path: string
  createdAt: Date
  read: boolean
}

// What each PM's bell shows: a note for every record waiting for their
// approval and every change request waiting for their decision, unread, and
// older notes already read. Each is only added when the person has no
// notification with that title yet, so running this again changes nothing,
// and one they have opened is not made unread again. Notifications cannot be
// deleted, so this only ever adds.
async function addNotifications(
  database: Database,
  teams: Map<string, { projectId: string; team: Team }>
) {
  const now = Date.now()
  const notes: Note[] = []

  for (const project of seedProjects) {
    const entry = teams.get(project.name)
    const pm = entry && holderOf(entry.team, "PM")

    if (!entry || !pm) {
      continue
    }

    const base = `/projects/${entry.projectId}`
    const records = projectRecords.get(project.name) ?? []

    records.forEach((record, index) => {
      if (record.state === "submitted") {
        notes.push({
          personId: pm,
          kind: "approval_needed",
          title: `${record.toolId} is waiting for your approval on ${project.name}`,
          path: `${base}/tools/${record.toolId}`,
          createdAt: new Date(now - (20 + index * 45) * 60 * 1000),
          read: false,
        })
      }
    })

    for (const request of projectChangeRequests.get(project.name) ?? []) {
      notes.push({
        personId: pm,
        kind: "change_waiting",
        title: `A change to ${request.toolId} is waiting for your decision on ${project.name}`,
        path: base,
        createdAt: new Date(now - 3 * HOUR),
        read: false,
      })
    }

    if (records.some((record) => record.state === "locked")) {
      notes.push({
        personId: pm,
        kind: "tool_open",
        title: `${records.findLast((record) => record.state === "locked")!.toolId} was locked on ${project.name}`,
        path: base,
        createdAt: new Date(now - 2 * DAY),
        read: true,
      })
    }

    notes.push({
      personId: pm,
      kind: "assigned",
      title: `You were added to ${project.name}`,
      path: base,
      createdAt: new Date(Date.parse(project.received) + DAY),
      read: true,
    })
  }

  for (const note of notes) {
    await database.pool.query(
      `INSERT INTO notifications (person_id, kind, title, path, created_at, read_at)
       SELECT $1::uuid, $2::notification_kind, $3::text, $4::text, $5::timestamptz, $6::timestamptz
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications WHERE person_id = $1::uuid AND title = $3::text
       )`,
      [
        note.personId,
        note.kind,
        note.title,
        note.path,
        note.createdAt,
        note.read ? note.createdAt : null,
      ]
    )
  }
}

// Each person is checked before adding, so running this again changes nothing
// and only what is missing is added back. A password already set is kept.
// Returns the person's id and whether they were new.
async function addPerson(
  database: Database,
  person: { name: string; email: string },
  passwordHash: string,
  accountType: AccountType = "staff"
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
        .values({
          name: person.name,
          email: person.email,
          emailVerified: true,
          accountType,
        })
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
export function rolesOnProject(project: SeedProject) {
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

// Local development only: IMHOGEN's staff, twelve projects at different stages
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
    const teams = new Map<string, { projectId: string; team: Team }>()

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

      const client = await addPerson(
        database,
        project.client,
        passwordHash,
        "client"
      )

      await giveProjectRole(database, client.id, projectId, "Client")

      if (client.isNew) {
        created.push({ role: "Client", email: project.client.email })
      }

      const team: Team = new Map()

      for (const { handle, role } of rolesOnProject(project)) {
        staffByHandle(handle)

        await giveProjectRole(database, ids.get(handle)!, projectId, role)

        if (!team.has(role)) {
          team.set(role, ids.get(handle)!)
        }
      }

      teams.set(project.name, { projectId, team })
      await addRecords(database, project, projectId, team)
    }

    // After every project, because the notifications point at their records.
    await addNotifications(database, teams)

    return created
  } finally {
    await database.pool.end()
  }
}
