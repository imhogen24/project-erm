import { layout, placeholder, type RenderedEmail } from "./html"

export type AssignedData = {
  projectName: string
  link: string
}

// Sent to a staff member when they are assigned to a project.
export function assigned(data: AssignedData): RenderedEmail {
  const lines = [
    `${placeholder}: you have been assigned to a project.`,
    `Project: ${data.projectName}`,
  ]

  return {
    subject: `[${placeholder}] Assigned to ${data.projectName}`,
    text: [...lines, `Open it: ${data.link}`].join("\n\n"),
    html: layout(lines, data.link),
  }
}
