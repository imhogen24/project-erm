import { ensureToolsRegistered } from "@/lib/tools"
import { inngestHandlers } from "@/server/inngest/serve"

// The intake creates D1.1 drafts, which are checked against the tools.
ensureToolsRegistered()

export const { GET, POST, PUT } = inngestHandlers()
