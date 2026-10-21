import { NextResponse, type NextRequest } from "next/server"

import type { Auth } from "./auth"

const SIGN_IN_PATH = "/sign-in"

// Better-Auth's own routes must stay open, or nobody could sign in.
const AUTH_ROUTES = "/api/auth/"

// Everything not named here needs a session.
function isPublic(pathname: string) {
  return pathname === SIGN_IN_PATH || pathname.startsWith(AUTH_ROUTES)
}

export function createProxy(auth: Auth) {
  return async function proxy(request: NextRequest) {
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
