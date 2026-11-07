import { createDatabase } from "@/db"

// Inserted straight into the database, like the unit tests do, so a test can
// choose when a notification was made and whether it is already read. The
// database refuses any UPDATE except marking read, so this is the only way to
// make an old or read one.
export async function addNotification(
  personId: string,
  input: {
    title: string
    path: string
    createdAt?: Date
    read?: boolean
  }
) {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is not set. Run with `bun run test:e2e`.")
  }

  const database = createDatabase(url)

  try {
    const createdAt = input.createdAt ?? new Date()

    const { rows } = await database.pool.query<{ id: string }>(
      `INSERT INTO notifications (person_id, kind, title, path, created_at, read_at)
       VALUES ($1, 'tool_open', $2, $3, $4, $5) RETURNING id`,
      [
        personId,
        input.title,
        input.path,
        createdAt,
        input.read ? createdAt : null,
      ]
    )

    return rows[0]!.id
  } finally {
    await database.pool.end()
  }
}
