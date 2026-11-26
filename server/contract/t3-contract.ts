import { inArray } from "drizzle-orm"
import { z } from "zod"

import { isUuid } from "@/lib/is-uuid"
import { people, type JsonObject } from "@/db/schema"
import { dateKey, nameKey, signOff, signatureKey } from "@/lib/t3-contract"
import type { Transaction } from "@/server/audit/audit"
import { briefValues } from "@/server/brief/project-brief"
import { holderOf } from "@/server/handoff/handoff"

type Reader = Pick<Transaction, "select">

const signed = z.object({ signedBy: z.string(), signedAt: z.string() })

const contact = z.object({ contactPerson: z.string().catch("") })

// What T3.D2.2a's sign-off shows, read live. Each row's name is whoever
// signed it, or until then the person expected to: the project's PM and FO,
// as D1.16 names people, and the contact person of the client's request, as
// D1.15 names them. Each date is the day the row was signed (UTC, which is
// Ghana time), empty until then.
export async function t3ContractValues(
  database: Reader,
  projectId: string,
  payload: JsonObject
): Promise<JsonObject> {
  const signatures = new Map(
    signOff.flatMap((row) => {
      const value = signed.safeParse(payload[signatureKey(row)])

      return value.success ? [[row.key, value.data] as const] : []
    })
  )

  // A signature holds the signer's ID, or their name once a screen has
  // filled it in.
  const ids = [...signatures.values()].map((each) => each.signedBy)

  const names = new Map(
    ids.length === 0
      ? []
      : (
          await database
            .select({ id: people.id, name: people.name })
            .from(people)
            .where(inArray(people.id, ids.filter(isUuid)))
        ).map((person) => [person.id, person.name])
  )

  const expected = {
    pm: () => holderOf(database, projectId, "PM"),
    fo: () => holderOf(database, projectId, "FO"),
    client: async () =>
      contact.parse(await briefValues(database, projectId)).contactPerson,
  }

  const rows = await Promise.all(
    signOff.map(async (row) => {
      const signature = signatures.get(row.key)

      return [
        [
          nameKey(row),
          signature
            ? (names.get(signature.signedBy) ?? signature.signedBy)
            : await expected[row.key](),
        ],
        [dateKey(row), signature ? signature.signedAt.slice(0, 10) : ""],
      ]
    })
  )

  return Object.fromEntries(rows.flat())
}
