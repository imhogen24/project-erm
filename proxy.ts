import type { NextRequest } from "next/server"

import { getAuth } from "@/server/auth"
import { createProxy } from "@/server/auth/protect"

export function proxy(request: NextRequest) {
  return createProxy(getAuth())(request)
}

// Skip Next.js internals and static files. Everything else is checked.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
