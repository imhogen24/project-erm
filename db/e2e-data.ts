import type { PoolClient } from "pg"

import { createDatabase } from "./index"

// What the browser tests make, told apart from the seed and from real data. A
// test project has a UUID in its request ID, where the website's are numbers.
// A test person has a hex email, and one test signs in as a fixed address.
const TEST_PROJECT =
  "^T[13]-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

const TEST_PERSON =
  "^([0-9a-f]{8}(-[0-9a-f]{8})?@example\\.com|sign-in-page@example\\.com)$"

function assertLocal(url: string) {
  const { hostname } = new URL(url)

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `Refusing to remove test data from a database that is not local: ${hostname}`
    )
  }
}

// The tables with a column that points at `table`, found from the database
// itself so a table added later is cleaned too.
async function pointingAt(client: PoolClient, table: string) {
  const { rows } = await client.query<{ child: string; column: string }>(
    `SELECT c.relname AS child, a.attname AS "column"
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_class p ON p.oid = k.confrelid
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f'
        AND p.relname = $1
        AND p.relnamespace = 'public'::regnamespace`,
    [table]
  )

  return rows
}

// Deletes every row that points at one of `ids` in `table`, and the rows that
// point at those in turn. A table being walked is not walked again inside
// itself, so a loop in the tables cannot run forever.
async function removePointing(
  client: PoolClient,
  table: string,
  ids: string[],
  walking: string[] = []
) {
  if (ids.length === 0) {
    return
  }

  for (const { child, column } of await pointingAt(client, table)) {
    if (walking.includes(child)) {
      continue
    }

    const further = (await pointingAt(client, child)).length > 0

    if (further) {
      const { rows } = await client.query<{ id: string }>(
        `DELETE FROM "${child}" WHERE "${column}" = ANY($1) RETURNING id`,
        [ids]
      )

      await removePointing(
        client,
        child,
        rows.map((row) => row.id),
        [...walking, table]
      )
    } else {
      await client.query(`DELETE FROM "${child}" WHERE "${column}" = ANY($1)`, [
        ids,
      ])
    }
  }
}

// Removes the projects and people the browser tests made, and everything that
// points at them. The audit log, the access log and notifications refuse deletes
// on purpose, so the protection is switched off for this one transaction only,
// and only on a database on this machine. The seed and the system person are
// never matched. It returns how many projects and people were removed.
export async function removeE2eData(url: string) {
  assertLocal(url)

  const database = createDatabase(url)
  const client = await database.pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("SET LOCAL session_replication_role = replica")

    const projects = (
      await client.query<{ id: string }>(
        "SELECT id FROM projects WHERE request_id ~ $1",
        [TEST_PROJECT]
      )
    ).rows.map((row) => row.id)

    const people = (
      await client.query<{ id: string }>(
        "SELECT id FROM people WHERE email ~ $1",
        [TEST_PERSON]
      )
    ).rows.map((row) => row.id)

    await removePointing(client, "projects", projects)
    await removePointing(client, "people", people)

    await client.query("DELETE FROM projects WHERE id = ANY($1)", [projects])
    await client.query("DELETE FROM people WHERE id = ANY($1)", [people])
    await client.query("COMMIT")

    return { projects: projects.length, people: people.length }
  } catch (error) {
    await client.query("ROLLBACK")

    throw error
  } finally {
    client.release()
    await database.pool.end()
  }
}
