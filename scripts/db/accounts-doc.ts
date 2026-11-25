import { format, resolveConfig } from "prettier"

import { roleInfo } from "@/lib/role-titles"

import { previews } from "./preview"
import { emailOf, holdsCompanyWide, loginFor, staff } from "./seed-data/people"
import { client, projects } from "./seed-data/projects"
import { SEED_PASSWORD } from "./seed-users"

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

function staffTable() {
  const rows = staff.map(
    (person) =>
      `| ${person.name} | ${emailOf(person.handle)} | ${roleName(person.role)} | ${holdsCompanyWide(person.role) ? "Yes" : "No"} |`
  )

  return [
    "| Name | Email | Role | Company-wide |",
    "| ---- | ----- | ---- | ------------ |",
    ...rows,
  ].join("\n")
}

function clientTable() {
  return [
    "| Name | Email | Organisation | Projects |",
    "| ---- | ----- | ------------ | -------- |",
    `| ${client.name} | ${client.email} | ${cell(client.organisation)} | Every project |`,
  ].join("\n")
}

function projectList() {
  return projects.map((project) => `- ${project.name}`).join("\n")
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

## Client

${clientTable()}

## Projects

Everyone above is on every project but the one waiting for a team, so each account sees the same projects from its own role's side. The projects named after a tool are for the tool being built: Fill in has it open and empty for the role that writes it, Approve has it submitted for the role that approves it, and Approved has it locked for everyone to read. Each \`Dev: Test\` project is for testing one tool: every tool before it is locked with sample answers, and the tool is open and empty, starting from those answers as a real project would. Run \`bun run db:reset\` to put every project back as seeded.

${projectList()}

## Screens to check

\`${PROJECT}\` is the project the screen names: open it from Your projects.

${screens()}
`
}
