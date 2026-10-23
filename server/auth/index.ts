import { getDatabase, requireEnv } from "@/server/database"

import { createAuth, type Auth } from "./auth"

let auth: Auth | undefined

// Built on first use, so a build that never signs anyone in needs no secrets.
export function getAuth() {
  auth ??= createAuth(getDatabase(), {
    secret: requireEnv("BETTER_AUTH_SECRET"),
    baseURL: requireEnv("BETTER_AUTH_URL"),
  })

  return auth
}
