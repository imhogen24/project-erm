import type { Role } from "@/db/schema"

// `.test` is reserved, so nothing sent to these addresses can reach a real
// inbox.
export const STAFF_DOMAIN = "imhogen.test"

export type Staff = { handle: string; name: string; role: Role }

export function emailOf(handle: string, domain = STAFF_DOMAIN) {
  return `${handle}@${domain}`
}

// IMHOGEN's own people: one per role, each signing in with the role's own
// address (om@imhogen.test is the Onboarding Manager). Everyone signs in with
// the same password.
export const staff: readonly Staff[] = [
  { handle: "itadmin", name: "Kofi Mensah", role: "IT/Admin" },
  { handle: "om", name: "Kwabena Asante", role: "OM" },
  { handle: "pm", name: "Ama Owusu", role: "PM" },
  { handle: "he", name: "Kwesi Appiah", role: "HE" },
  { handle: "le", name: "Kojo Antwi", role: "LE" },
  { handle: "ae", name: "Fiifi Acquah", role: "AE" },
  { handle: "fo", name: "Akosua Darko", role: "FO" },
  { handle: "ld", name: "Nii Lamptey", role: "LD" },
  { handle: "ca", name: "Gifty Ofori", role: "CA" },
  { handle: "po", name: "Samuel Tetteh", role: "PO" },
  { handle: "io", name: "Rebecca Ankrah", role: "IO" },
  { handle: "ws", name: "Daniel Amoako", role: "WS" },
  { handle: "tech", name: "Joseph Kuffour", role: "T" },
  { handle: "qa", name: "Mavis Hammond", role: "QA" },
  { handle: "lfe", name: "Prince Ayivor", role: "LFE" },
  { handle: "lo", name: "Comfort Nyarko", role: "LO" },
  { handle: "cr", name: "Emmanuel Quaye", role: "CR" },
  { handle: "mkt", name: "Phyllis Addo", role: "MKT" },
]

// A qualification says the person can be assigned the role on any project. It
// gives no access to a project by itself. IT/Admin is held company-wide and is
// access to every project.
export const qualifiedRoles: readonly Role[] = [
  "OM",
  "PM",
  "HE",
  "FO",
  "LE",
  "AE",
  "LD",
]

export function holdsCompanyWide(role: Role) {
  return role === "IT/Admin" || qualifiedRoles.includes(role)
}

export function staffByHandle(handle: string) {
  const found = staff.find((person) => person.handle === handle)

  if (!found) {
    throw new Error(`No seed person has the handle ${handle}`)
  }

  return found
}

// The person holding a role.
export function staffWith(role: Role) {
  const found = staff.find((person) => person.role === role)

  if (!found) {
    throw new Error(`No seed person holds ${role}`)
  }

  return found
}

// Who the preview guide logs in as for a role.
export function loginFor(role: Role) {
  return emailOf(staffWith(role).handle)
}
