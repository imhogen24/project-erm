import { createDatabase } from "@/db"
import {
  AdminExistsError,
  InvalidInviteInputError,
  createFirstAdminInvite,
} from "@/server/invites/invites"

// Makes the first IT/Admin on a new system: prints a one-time invite link.
// Nothing is read from an env file: the database and the app's address are
// given on the command line, so it never runs against a database by accident.
//
//   DATABASE_URL='postgres://…' BETTER_AUTH_URL='https://…' \
//     bun run admin:create "Full Name" person@company.com

const [name, email] = process.argv.slice(2)

const url = process.env.DATABASE_URL

const baseURL = process.env.BETTER_AUTH_URL

if (!name || !email || !url || !baseURL) {
  console.error(
    'Usage: DATABASE_URL=… BETTER_AUTH_URL=… bun run admin:create "Full Name" email'
  )
  process.exit(1)
}

const database = createDatabase(url)

try {
  console.log(`Database: ${new URL(url).hostname}`)

  const { link } = await createFirstAdminInvite(
    database,
    { name, email },
    { baseURL }
  )

  console.log(`Invite for ${email}, valid for 7 days, usable once:`)
  console.log(link)
} catch (error) {
  if (
    error instanceof AdminExistsError ||
    error instanceof InvalidInviteInputError
  ) {
    console.error(error.message)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  await database.pool.end()
}
