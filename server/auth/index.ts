import { createDatabase } from "@/db"

import { createAuth, type Auth } from "./auth"

let auth: Auth | undefined

function requireEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

// Built on first use, so a build that never signs anyone in needs no secrets.
export function getAuth() {
  auth ??= createAuth(createDatabase(requireEnv("DATABASE_URL")), {
    secret: requireEnv("BETTER_AUTH_SECRET"),
    baseURL: requireEnv("BETTER_AUTH_URL"),
  })

  return auth
}
