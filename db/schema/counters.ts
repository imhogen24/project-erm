import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core"

// The last count given in each running sequence (lib/sequences), per period,
// such as 2 for "invoice" in "26": the next invoice of 2026 is 003. Taken
// and raised in one statement, inside the transaction that uses it, so two
// records never get the same number.
export const counters = pgTable(
  "counters",
  {
    name: text().notNull(),
    period: text().notNull(),
    value: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.name, table.period] })]
)
