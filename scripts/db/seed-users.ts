import type { Role } from "@/db/schema"

export type SeedUser = { role: Role; email: string }

export async function seed(url: string): Promise<SeedUser[]> {
  void url

  return []
}
