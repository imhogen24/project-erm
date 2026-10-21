import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import type { Database } from "@/db"
import { accounts, people, sessions, verifications } from "@/db/schema"

export type AuthConfig = { secret: string; baseURL: string }

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
  })
}

export type Auth = ReturnType<typeof createAuth>
