import { Inngest } from "inngest"

// Reads INNGEST_SIGNING_KEY, or INNGEST_DEV for the local dev server, on first
// use.
export const inngest = new Inngest({ id: "project-erm" })
