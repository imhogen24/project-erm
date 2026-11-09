import type { Role } from "@/db/schema"

// `.test` is reserved, so nothing sent to these addresses can reach a real
// inbox.
export const STAFF_DOMAIN = "imhogen.test"

export type Staff = { handle: string; name: string; role: Role }

export function emailOf(handle: string, domain = STAFF_DOMAIN) {
  return `${handle}@${domain}`
}

// IMHOGEN's own people. The first person listed for a role is who the preview
// guide says to log in as. Everyone signs in with the same password.
export const staff: readonly Staff[] = [
  { handle: "kofi.mensah", name: "Kofi Mensah", role: "IT/Admin" },

  { handle: "ama.owusu", name: "Ama Owusu", role: "PM" },
  { handle: "yaw.boateng", name: "Yaw Boateng", role: "PM" },
  { handle: "efua.quartey", name: "Efua Quartey", role: "PM" },
  { handle: "nana.adjei", name: "Nana Adjei", role: "PM" },

  { handle: "kwabena.asante", name: "Kwabena Asante", role: "OM" },
  { handle: "abena.frimpong", name: "Abena Frimpong", role: "OM" },
  { handle: "selorm.dzigbordi", name: "Selorm Dzigbordi", role: "OM" },

  { handle: "akosua.darko", name: "Akosua Darko", role: "FO" },
  { handle: "edem.agbeko", name: "Edem Agbeko", role: "FO" },

  { handle: "kojo.antwi", name: "Kojo Antwi", role: "LE" },
  { handle: "esi.mensima", name: "Esi Mensima", role: "LE" },
  { handle: "yaa.sarpong", name: "Yaa Sarpong", role: "LE" },

  { handle: "fiifi.acquah", name: "Fiifi Acquah", role: "AE" },
  { handle: "adwoa.baffoe", name: "Adwoa Baffoe", role: "AE" },

  { handle: "kwesi.appiah", name: "Kwesi Appiah", role: "HE" },
  { handle: "nii.lamptey", name: "Nii Lamptey", role: "LD" },
  { handle: "gifty.ofori", name: "Gifty Ofori", role: "CA" },
  { handle: "samuel.tetteh", name: "Samuel Tetteh", role: "PO" },
  { handle: "rebecca.ankrah", name: "Rebecca Ankrah", role: "IO" },
  { handle: "daniel.amoako", name: "Daniel Amoako", role: "WS" },
  { handle: "joseph.kuffour", name: "Joseph Kuffour", role: "T" },
  { handle: "mavis.hammond", name: "Mavis Hammond", role: "QA" },
  { handle: "prince.ayivor", name: "Prince Ayivor", role: "LFE" },
  { handle: "comfort.nyarko", name: "Comfort Nyarko", role: "LO" },
  { handle: "emmanuel.quaye", name: "Emmanuel Quaye", role: "CR" },
  { handle: "phyllis.addo", name: "Phyllis Addo", role: "MKT" },
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

// Who the preview guide logs in as for a role: the first person with it.
export function loginFor(role: Role) {
  const found = staff.find((person) => person.role === role)

  if (!found) {
    throw new Error(`No seed person holds ${role}`)
  }

  return emailOf(found.handle)
}
