import { NextResponse, type NextRequest } from "next/server"

import type { Auth } from "./auth"

const SIGN_IN_PATH = "/sign-in"

// Better-Auth's own routes must stay open, or nobody could sign in.
const AUTH_ROUTES = "/api/auth/"

// Someone with an invite link has no account yet, so invite links stay open.
const INVITE_ROUTES = "/invite/"

// Pages for developers, such as the form preview. Production answers not found.
const DEV_ROUTES = "/dev/"

// Everything not named here needs a session.
function isPublic(pathname: string) {
  return (
    pathname === SIGN_IN_PATH ||
    pathname.startsWith(AUTH_ROUTES) ||
    pathname.startsWith(INVITE_ROUTES)
  )
}

export type ProxyOptions = {
  // Dev-only pages answer "not found" in production. Defaults to the build.
  production?: boolean
}

export function createProxy(auth: Auth, options: ProxyOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production"

  return async function proxy(request: NextRequest) {
    // A page for developers does not exist in production, and says so to
    // everyone, signed in or not.
    if (production && request.nextUrl.pathname.startsWith(DEV_ROUTES)) {
      return NextResponse.rewrite(new URL("/404", request.url))
    }

    if (isPublic(request.nextUrl.pathname)) {
      return NextResponse.next()
    }

    const session = await auth.api.getSession({ headers: request.headers })

    if (session) {
      return NextResponse.next()
    }

    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url))
  }
}
