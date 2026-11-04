import { serve } from "inngest/next"

import { inngest } from "./client"
import { functions } from "./functions"

type Handler = ReturnType<typeof serve>["GET"]

function isDev(value = "") {
  return value !== "" && !["0", "false"].includes(value.toLowerCase())
}

// Deployed with a signing key, or run against the local dev server.
function isConfigured() {
  return (
    Boolean(process.env.INNGEST_SIGNING_KEY) || isDev(process.env.INNGEST_DEV)
  )
}

function notConfigured() {
  return new Response("Inngest is not configured.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

// Inngest checks each request's signature. Without keys, as on preview
// deployments, every request gets a plain "not configured" reply instead of an
// error.
export function inngestHandlers() {
  const served = serve({ client: inngest, functions })

  const guard =
    (handler: Handler): Handler =>
    async (request, context) =>
      isConfigured() ? handler(request, context) : notConfigured()

  return {
    GET: guard(served.GET),
    POST: guard(served.POST),
    PUT: guard(served.PUT),
  }
}
