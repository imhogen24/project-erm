import { sql } from "drizzle-orm"

import { counters } from "@/db/schema"
import {
  formatNumber,
  isSequenceName,
  periodOf,
  sequences,
} from "@/lib/sequences"
import type { Transaction } from "@/server/audit/audit"

export class UnknownSequenceError extends Error {}

// The next number of the named sequence for the year `when` falls in, such
// as IMHO-INV26-003. The count is raised in the same statement that reads
// it, so a second caller waits for this transaction and gets the one after.
// A transaction that rolls back gives its count back.
export async function nextNumber(
  transaction: Pick<Transaction, "insert">,
  name: string,
  when: Date = new Date()
): Promise<string> {
  if (!isSequenceName(name)) {
    throw new UnknownSequenceError(`No running sequence named ${name}`)
  }

  const sequence = sequences[name]

  const period = periodOf(when)

  const [counter] = await transaction
    .insert(counters)
    .values({ name, period, value: 1 })
    .onConflictDoUpdate({
      target: [counters.name, counters.period],
      set: { value: sql`${counters.value} + 1` },
    })
    .returning({ value: counters.value })

  return formatNumber(sequence, period, counter!.value)
}
