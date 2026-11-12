import { format, resolveConfig } from "prettier"

import { roleInfo } from "@/lib/role-titles"

import { previews } from "./preview"
import { emailOf, holdsCompanyWide, loginFor, staff } from "./seed-data/people"
import { featuredProject, projects } from "./seed-data/projects"
import { SEED_PASSWORD, rolesOnProject } from "./seed-users"

export const ACCOUNTS_DOC = "docs/TEST_ACCOUNTS/_.md"

const PROJECT = ":project"

function roleName(role: string) {
  const title = roleInfo.get(role)?.title

  return title ? `${role} (${title})` : role
}

// Escapes a table cell: a pipe would end the cell.
function cell(text: string) {
  return text.replaceAll("|", "\\|")
}

// The projects each staff member is on, by handle, with the role held there.
function projectsByHandle() {
  const held = new Map<string, string[]>()

  for (const project of projects) {
    for (const { handle, role } of rolesOnProject(project)) {
      held.set(handle, [
        ...(held.get(handle) ?? []),
        `${project.name} (${role})`,
      ])
    }
  }

  return held
}

function staffTable() {
  const held = projectsByHandle()

  const rows = staff.map((person) => {
    const on =
      person.role === "IT/Admin"
        ? "Every project"
        : (held.get(person.handle) ?? []).join(", ") || "None"

    return `| ${person.name} | ${emailOf(person.handle)} | ${roleName(person.role)} | ${holdsCompanyWide(person.role) ? "Yes" : "No"} | ${cell(on)} |`
  })

  return [
    "| Name | Email | Role | Company-wide | Projects |",
    "| ---- | ----- | ---- | ------------ | -------- |",
    ...rows,
  ].join("\n")
}

function clientTable() {
  const rows = projects.map(
    (project) =>
      `| ${project.client.name} | ${project.client.email} | ${cell(project.client.organisation)} | ${project.name} |`
  )

  return [
    "| Name | Email | Organisation | Project |",
    "| ---- | ----- | ------------ | ------- |",
    ...rows,
  ].join("\n")
}

function screens() {
  return previews
    .map((preview) =>
      [
        `### ${preview.screen}`,
        "",
        `- Log in as: ${preview.email ?? loginFor(preview.loginAs)} (${preview.loginAs})`,
        `- Go to: \`${preview.path(PROJECT)}\``,
        `- You see: ${preview.expect}`,
      ].join("\n")
    )
    .join("\n\n")
}

// The local test accounts and the screens to check with them, written from the
// seed data, so it never drifts from what `bun run dev` seeds. Formatted as
// the repo formats Markdown.
export async function accountsDoc() {
  const config = await resolveConfig(ACCOUNTS_DOC)

  return format(markdown(), { ...config, parser: "markdown" })
}

function markdown() {
  return `# Test accounts

The people \`bun run dev\` seeds into the local database. Sign in at http://localhost:3000/sign-in. Every account's password is \`${SEED_PASSWORD}\`. Nothing sent to these addresses reaches a real inbox.

Written by \`bun run accounts:doc\` from \`scripts/db/seed-data/\` and \`scripts/db/preview.ts\`; do not edit it by hand.

## Staff

Company-wide: IT/Admin sees every project; the other company-wide roles can be assigned to any project, and give no access by themselves.

${staffTable()}

## Clients

Client accounts, each the client on one project.

${clientTable()}

## Screens to check

\`${PROJECT}\` is ${featuredProject.name}: open it from Your projects.

${screens()}
`
}
