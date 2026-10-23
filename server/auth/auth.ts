import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import { eq } from "drizzle-orm"

import type { Database } from "@/db"
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

export type AuthConfig = { secret: string; baseURL: string }

// Signing in or out belongs to no project, so the line has no project or roles.
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
    // Accounts are made by invite only, never by the person themselves.
    emailAndPassword: { enabled: true, disableSignUp: true },
    advanced: { database: { generateId: "uuid" } },
    // A throw in a "before" hook stops the change, so nobody signs in or out
    // without a log line.
    databaseHooks: {
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
