import { z } from "zod"

// Whether a stored reference is a person's or record's id. A seeded or older
// record may name someone another way, such as "role:Client"; looking that up
// as an id would fail the whole query.
export function isUuid(text: string) {
  return z.uuid().safeParse(text).success
}
