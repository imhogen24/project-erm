import { createHash, randomBytes } from "node:crypto"

import { hashPassword } from "better-auth/crypto"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import type { Database } from "@/db"
import {
  accounts,
  invitations,
  people,
  personProjectRoles,
  roles as knownRoles,
  type Role,
} from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { PermissionDeniedError } from "@/server/permissions/permissions"

export class InvalidInviteInputError extends Error {}

export class InviteNotFoundError extends Error {}

export class InviteExpiredError extends Error {}

export class InviteUsedError extends Error {}

export class WeakPasswordError extends Error {}

export type InviteInput = {
  email: string
  name: string
  projectId: string
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

function cleanRoles(values: string[]) {
  if (values.length === 0) {
    throw new InvalidInviteInputError("An invite needs at least one role")
  }

  const cleaned: Role[] = []

  for (const value of values) {
    if (!isRole(value)) {
      throw new InvalidInviteInputError(`"${value}" is not a role`)
    }

    if (!cleaned.includes(value)) {
      cleaned.push(value)
    }
  }

  return cleaned
}

// IT/Admin on any project counts as IT/Admin for the whole company.
async function assertItAdmin(database: Database, actor: string) {
  const [held] = await database
    .select({ role: personProjectRoles.role })
    .from(personProjectRoles)
    .where(
      and(
        eq(personProjectRoles.personId, actor),
        eq(personProjectRoles.role, "IT/Admin")
      )
    )
    .limit(1)

  if (!held) {
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

async function giveRoles(
  database: Database,
  personId: string,
  projectId: string,
  held: Role[]
) {
  await database
    .insert(personProjectRoles)
    .values(held.map((role) => ({ personId, projectId, role })))
    .onConflictDoNothing()
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
  const held = cleanRoles(input.roles)

  const existing = await findPerson(database, address)

  if (existing && (await hasPassword(database, existing.id))) {
    await giveRoles(database, existing.id, input.projectId, held)

    return { status: "added", personId: existing.id }
  }

  const token = randomBytes(32).toString("base64url")

  await database.insert(invitations).values({
    email: address,
    name,
    projectId: input.projectId,
    roles: held,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    invitedBy: actor,
  })

  const base = options.baseURL.replace(/\/+$/, "")

  return { status: "invited", link: `${base}/invite/${token}` }
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

    await transaction
      .insert(personProjectRoles)
      .values(
        invite.roles.map((role) => ({
          personId,
          projectId: invite.projectId,
          role,
        }))
      )
      .onConflictDoNothing()

    await transaction
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id))

    return { personId }
  })
}
