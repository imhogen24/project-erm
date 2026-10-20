import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString })

  return Object.assign(drizzle(pool, { schema }), { pool })
}
