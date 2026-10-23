import type { ProjectSummary } from "@/server/projects/projects"

// IT/Admin on any project counts as IT/Admin for the whole company.
export function isItAdmin(projects: ProjectSummary[]) {
  return projects.some((project) => project.roles.includes("IT/Admin"))
}
