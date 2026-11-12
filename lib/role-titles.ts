// Each role's title and department, from the role list in
// docs/dev_docs/CRITICAL_DATA_STRUCTURE/AGENT_ROLES.md.
export const roleInfo = new Map<string, { title: string; group: string }>([
  ["Client", { title: "External stakeholder", group: "Client" }],
  ["PM", { title: "Project Manager", group: "Operations" }],
  ["OM", { title: "Onboarding Manager", group: "Operations" }],
  ["CA", { title: "Contract Administrator", group: "Operations" }],
  ["PO", { title: "Procurement Officer", group: "Operations" }],
  ["IO", { title: "Inventory Officer", group: "Operations" }],
  ["WS", { title: "Workshop Supervisor", group: "Operations" }],
  ["T", { title: "Technician", group: "Operations" }],
  ["QA", { title: "QA Officer", group: "Operations" }],
  ["LFE", { title: "Field Engineer", group: "Operations" }],
  ["LO", { title: "Logistics Officer", group: "Operations" }],
  ["CR", { title: "Client Relations", group: "Operations" }],
  ["HE", { title: "Head of Engineering", group: "Engineering" }],
  ["LE", { title: "Lead Engineer", group: "Engineering" }],
  ["AE", { title: "Assigned Engineer", group: "Engineering" }],
  ["LD", { title: "Lead Draftsman", group: "Engineering" }],
  ["FO", { title: "Finance Officer", group: "Finance, IT and marketing" }],
  [
    "IT/Admin",
    { title: "Systems support", group: "Finance, IT and marketing" },
  ],
  ["MKT", { title: "Marketing Hub", group: "Finance, IT and marketing" }],
])
