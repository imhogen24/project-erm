import { getDatabase } from "@/server/database"
import { companyRolesOf } from "@/server/permissions/permissions"

// Only a company-wide IT/Admin gives access, so only they see the invite page.
export async function isItAdmin(personId: string) {
  return (await companyRolesOf(getDatabase(), personId)).includes("IT/Admin")
}
