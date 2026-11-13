// For testing in development only: on a project whose name starts with this,
// every Workbook 1 tool can be started at once, without waiting for the tool
// before it. Production never does this. Remove this file, its use in
// workflow.ts and the Dev projects in scripts/db when testing no longer needs
// them.
export const DEV_UNLOCKED = "Dev: All Tools Unlocked"

export const DEV_LOCKED = "Dev: All Tools Locked"

// What every Dev project's name starts with.
export const DEV_PROJECT = "Dev: All Tools"

// In development the Dev projects take up nobody's workload slot, since the
// same people are on all of them.
export function skipsDevProjects(): boolean {
  return process.env.NODE_ENV !== "production"
}

export function opensEveryTool(projectName: string): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    projectName.startsWith(DEV_UNLOCKED)
  )
}
