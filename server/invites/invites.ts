import { createHash, randomBytes } from "node:crypto"

import { hashPassword } from "better-auth/crypto"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  accessLog,
  accounts,
  invitations,
  people,
  personProjectRoles,
  roles as knownRoles,
  type Role,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { addCompanyRoles } from "@/server/company-roles/company-roles"
import {
  PermissionDeniedError,
  companyRolesOf,
} from "@/server/permissions/permissions"
import { systemActor } from "@/server/system/system"

export class InvalidInviteInputError extends Error {}

export class InviteNotFoundError extends Error {}

export class InviteExpiredError extends Error {}

export class InviteUsedError extends Error {}

export class WeakPasswordError extends Error {}

export type InviteInput = {
  email: string
  name: string
  // No project gives the roles company-wide, on every project.
  projectId: string | null
  roles: string[]
}

export type CreatedInvite =
  { status: "invited"; link: string } | { status: "added"; personId: string }

const INVITE_DAYS = 7

const MIN_PASSWORD_LENGTH = 8

const email = z.email()

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function isRole(value: string): value is Role {
  return knownRoles.some((role) => role === value)
}

// Emails are kept in lower case, so "Ama@Example.com" and "ama@example.com"
// are the same person.
function cleanEmail(value: string) {
  const lowered = value.trim().toLowerCase()

  if (!email.safeParse(lowered).success) {
    throw new InvalidInviteInputError(`"${value}" is not an email address`)
  }

  return lowered
}

function cleanRoles(values: string[], projectId: string | null) {
  if (values.length === 0) {
    throw new InvalidInviteInputError("An invite needs at least one role")
  }

  const cleaned: Role[] = []

  for (const value of values) {
    if (!isRole(value)) {
      throw new InvalidInviteInputError(`"${value}" is not a role`)
    }

    if (value === "Client" && projectId === null) {
      throw new InvalidInviteInputError(
        "A Client is always tied to their own project"
      )
    }

    if (!cleaned.includes(value)) {
      cleaned.push(value)
    }
  }

  return cleaned
}

// Only a company-wide IT/Admin gives access. IT/Admin on one project is not
// enough.
async function assertItAdmin(database: Database, actor: string) {
  if (!(await companyRolesOf(database, actor)).includes("IT/Admin")) {
    throw new PermissionDeniedError("Only an IT/Admin can invite people")
  }
}

async function findPerson(database: Database, address: string) {
  const [person] = await database
    .select({ id: people.id })
    .from(people)
    .where(sql`lower(${people.email}) = ${address}`)

  return person
}

// A person can exist without being able to sign in. What counts is a password.
async function hasPassword(
  database: Pick<Database, "select">,
  personId: string
) {
  const [account] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.personId, personId),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password)
      )
    )
    .limit(1)

  return account !== undefined
}

// Fills in the password of a person who has an empty credential account, or
// makes the account if they have none.
async function setPassword(
  transaction: Transaction,
  personId: string,
  passwordHash: string
) {
  const [updated] = await transaction
    .update(accounts)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(
      and(
        eq(accounts.personId, personId),
        eq(accounts.providerId, "credential")
      )
    )
    .returning({ id: accounts.id })

  if (!updated) {
    await transaction.insert(accounts).values({
      personId,
      accountId: personId,
      providerId: "credential",
      password: passwordHash,
    })
  }
}

// Returns only the roles that were new, so the log never claims a change that
// did not happen.
async function giveRoles(
  transaction: Transaction,
  personId: string,
  projectId: string | null,
  held: Role[]
) {
  if (projectId === null) {
    return addCompanyRoles(transaction, personId, held)
  }

  const added = await transaction
    .insert(personProjectRoles)
    .values(held.map((role) => ({ personId, projectId, role })))
    .onConflictDoNothing()
    .returning({ role: personProjectRoles.role })

  return added.map((row) => row.role)
}

export async function createInvite(
  database: Database,
  actor: string,
  input: InviteInput,
  options: { baseURL: string }
): Promise<CreatedInvite> {
  await assertItAdmin(database, actor)

  const name = input.name.trim()

  if (name === "") {
    throw new InvalidInviteInputError("An invite needs a name")
  }

  const address = cleanEmail(input.email)
  const held = cleanRoles(input.roles, input.projectId)

  const existing = await findPerson(database, address)

  if (existing?.id === systemActor) {
    throw new InvalidInviteInputError("The system cannot be invited")
  }

  // Each change is written in one transaction with its access_log line, so a
  // failed log line undoes the change.
  if (existing && (await hasPassword(database, existing.id))) {
    await database.transaction(async (transaction) => {
      const added = await giveRoles(
        transaction,
        existing.id,
        input.projectId,
        held
      )

      if (added.length === 0) {
        return
      }

      await transaction.insert(accessLog).values({
        actorId: actor,
        action: "roles_added",
        personId: existing.id,
        email: address,
        projectId: input.projectId,
        roles: added,
      })
    })

    return { status: "added", personId: existing.id }
  }

  const token = randomBytes(32).toString("base64url")

  await database.transaction(async (transaction) => {
    await transaction.insert(invitations).values({
      email: address,
      name,
      projectId: input.projectId,
      roles: held,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      invitedBy: actor,
    })

    await transaction.insert(accessLog).values({
      actorId: actor,
      action: "invited",
      email: address,
      projectId: input.projectId,
      roles: held,
    })
  })

  const base = options.baseURL.replace(/\/+$/, "")

  return { status: "invited", link: `${base}/invite/${token}` }
}

// What the accept page shows: who the invite is for. Reading it uses nothing
// up, and it gives back only the name and email.
export async function getInvite(
  database: Database,
  token: string
): Promise<{ name: string; email: string }> {
  const [invite] = await database
    .select({
      name: invitations.name,
      email: invitations.email,
      acceptedAt: invitations.acceptedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))

  if (!invite) {
    throw new InviteNotFoundError("This invite does not exist")
  }

  if (invite.acceptedAt) {
    throw new InviteUsedError("This invite has already been used")
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new InviteExpiredError("This invite has expired")
  }

  return { name: invite.name, email: invite.email }
}

// The invite row is locked while it is checked, so two simultaneous accepts
// cannot both use it. A person who already has a password gets the roles added
// and keeps that password. A person who exists without one gets the password
// they choose here.
export async function acceptInvite(
  database: Database,
  token: string,
  password: string
): Promise<{ personId: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `A password needs at least ${MIN_PASSWORD_LENGTH} characters`
    )
  }

  const passwordHash = await hashPassword(password)

  return database.transaction(async (transaction) => {
    const [invite] = await transaction
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)))
      .for("update")

    if (!invite) {
      throw new InviteNotFoundError("This invite does not exist")
    }

    if (invite.acceptedAt) {
      throw new InviteUsedError("This invite has already been used")
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new InviteExpiredError("This invite has expired")
    }

    const [existing] = await transaction
      .select({ id: people.id })
      .from(people)
      .where(sql`lower(${people.email}) = ${invite.email}`)

    let personId = existing?.id

    if (!personId) {
      const [created] = await transaction
        .insert(people)
        .values({ name: invite.name, email: invite.email })
        .returning({ id: people.id })

      personId = created!.id

      await setPassword(transaction, personId, passwordHash)
    } else if (!(await hasPassword(transaction, personId))) {
      await setPassword(transaction, personId, passwordHash)
    }

    await giveRoles(transaction, personId, invite.projectId, invite.roles)

    await transaction
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id))

    await transaction.insert(accessLog).values({
      actorId: personId,
      action: "invite_accepted",
      personId,
      email: invite.email,
      projectId: invite.projectId,
      roles: invite.roles,
    })

    return { personId }
  })
}
