import { randomUUID } from "node:crypto"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import { eq } from "drizzle-orm"

import type { Database } from "@/db"
import { attachRequests } from "@/server/accounts/accounts"
import { sendEmail, type Transport } from "@/server/email/email"
import {
  accessLog,
  accounts,
  people,
  sessions,
  verifications,
  type AccessAction,
} from "@/db/schema"

// The requests where a person ends a session on purpose. A session that ran out
// is cleaned up by other requests and writes nothing.
const SESSION_ENDING_PATHS = new Set([
  "/sign-out",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
])

export type AuthConfig = {
  secret: string
  baseURL: string
  // Tests pass a fake. Otherwise the transport the environment sets.
  transport?: Transport
}

// The same as an invite's.
const MIN_PASSWORD_LENGTH = 8

// Signing up, in or out belongs to no project, so the line has no project or
// roles.
// The person is both the actor and the subject.
async function logSession(
  database: Database,
  action: AccessAction,
  personId: string
) {
  const [person] = await database
    .select({ email: people.email })
    .from(people)
    .where(eq(people.id, personId))

  await database.insert(accessLog).values({
    actorId: personId,
    action,
    personId,
    email: person!.email.toLowerCase(),
  })
}

// Better-Auth's "user" is the `people` table, so there is no second user table.
export function createAuth(database: Database, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: people,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    session: { fields: { userId: "personId" } },
    account: { fields: { userId: "personId" } },
    // Sign-up makes client accounts only. Staff come by invite, which writes
    // the person directly, so the type below is never "staff" from here.
    user: {
      additionalFields: {
        accountType: {
          type: "string",
          fieldName: "accountType",
          input: false,
          defaultValue: "client",
        },
      },
    },
    // Nobody signs in before confirming their email. Invites and the seed
    // confirm it when they make the person.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      // Awaited, so the email is sent before a serverless request ends. Each
      // ask is its own email: two links made in the same second are the same
      // token, so the key is new each time and never holds the token.
      // A failed send throws, so the page that asked says the link was not
      // sent. Sign-up itself still succeeds; the person asks again.
      sendVerificationEmail: async ({ user, url }) => {
        const sent = await sendEmail(
          database,
          {
            to: user.email,
            kind: "verify_email",
            data: { name: user.name, link: url },
            key: `verify_email:${user.id}:${randomUUID()}`,
          },
          config.transport
        )

        if (sent.status === "failed") {
          throw new Error("The confirm-email link was not sent")
        }
      },
      afterEmailVerification: async (user) => {
        await attachRequests(database, user.id)
      },
    },
    advanced: { database: { generateId: "uuid" } },
    // A throw in a "before" hook stops the change, so nobody signs in or out
    // without a log line.
    databaseHooks: {
      // Only sign-up makes a person through Better-Auth, so every new user
      // here is a sign-up. A duplicate email makes no user and logs nothing.
      user: {
        create: {
          after: async (user) => {
            await logSession(database, "signed_up", user.id)
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            await logSession(database, "signed_in", session.userId)
          },
        },
        delete: {
          before: async (session, context) => {
            if (context?.path && SESSION_ENDING_PATHS.has(context.path)) {
              await logSession(database, "signed_out", session.userId)
            }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
