import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getAuth } from "@/server/auth"

// The person signed in on this request. The proxy already turns signed-out
// visitors away, so the redirect is a second guard, not the first.
export async function requireSession() {
  // Read the headers first: that marks the page as per-request, so a build
  // never tries to sign anyone in.
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({ headers: requestHeaders })

  if (!session) {
    redirect("/sign-in")
  }

  return session
}
